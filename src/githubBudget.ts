/**
 * Shared GitHub core-REST budget.
 *
 * Unauthenticated calls share 60/hour per IP. Spacing requests cannot raise
 * that ceiling — one package.json spends it. This gate stops further repo
 * calls once the budget is exhausted (probe, remaining: 0, or 403/429) until
 * x-ratelimit-reset / Retry-After. A small start gap and in-flight cap only
 * exist to stay under GitHub's secondary (burst) limit after auth.
 */

const MIN_INTERVAL_MS = 80;
const MAX_IN_FLIGHT = 4;
const DEFAULT_BACKOFF_MS = 60_000;
const PROBE_TTL_MS = 60_000;

export type GithubSlot =
  | { ok: true; release: () => void; epoch: number }
  | { ok: false; retryAfterMs: number };

export type GithubBudgetOptions = {
  minIntervalMs?: number;
  maxInFlight?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

type ProbeGate =
  | { kind: "start"; epoch: number }
  | { kind: "wait" }
  | { kind: "skip" };

export class GithubBudget {
  private identity = "anon";
  private epoch = 0;
  private blockedUntil = 0;
  private allowance = Number.POSITIVE_INFINITY;
  private allowanceResetAt = 0;
  private serverLimited = false;
  private probedAt = 0;
  /** Bumped only when the server says the core budget is exhausted. */
  private limitVersion = 0;
  private probing = false;
  private probeDone: Promise<void> = Promise.resolve();
  private resolveProbe: (() => void) | undefined;
  private inFlight = 0;
  private nextStartAt = 0;
  private chain: Promise<void> = Promise.resolve();
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly options: GithubBudgetOptions = {}) {}

  /** Drop a block when the credential changes (anon → account/PAT or a new PAT). */
  setIdentity(token: string | undefined): void {
    const next = tokenIdentity(token);
    if (next === this.identity) {
      return;
    }
    this.identity = next;
    this.epoch += 1;
    this.blockedUntil = 0;
    this.allowance = Number.POSITIVE_INFINITY;
    this.allowanceResetAt = 0;
    this.serverLimited = false;
    this.probedAt = 0;
    this.probing = false;
    const resolve = this.resolveProbe;
    this.resolveProbe = undefined;
    resolve?.();
  }

  blockedUntilMs(): number | undefined {
    return this.now() < this.blockedUntil ? this.blockedUntil : undefined;
  }

  tryStartProbe(): ProbeGate {
    if (this.blockedUntilMs() !== undefined) {
      return { kind: "skip" };
    }
    if (this.probing) {
      return { kind: "wait" };
    }
    if (this.now() - this.probedAt < PROBE_TTL_MS) {
      return { kind: "skip" };
    }
    this.probing = true;
    this.probeDone = new Promise((resolve) => {
      this.resolveProbe = resolve;
    });
    return { kind: "start", epoch: this.epoch };
  }

  joinProbe(): Promise<void> {
    return this.probeDone;
  }

  finishProbe(epoch: number, apply: () => void): void {
    if (epoch !== this.epoch || !this.probing) {
      return;
    }
    apply();
    this.probedAt = this.now();
    this.endProbe();
  }

  abandonProbe(epoch: number, stamp: boolean): void {
    if (epoch !== this.epoch || !this.probing) {
      return;
    }
    if (stamp) {
      this.probedAt = this.now();
    }
    this.endProbe();
  }

  noteCoreLimit(remaining: number, resetEpochSec: number): void {
    const resetMs = resetEpochSec * 1000;
    this.allowance = remaining;
    this.allowanceResetAt = resetMs;
    if (remaining <= 0 && resetMs > this.now()) {
      this.blockedUntil = Math.max(this.blockedUntil, resetMs);
      this.serverLimited = true;
      this.limitVersion += 1;
    }
  }

  /** Give back a unit reserved by `acquire` when no request was sent. */
  refund(epoch: number): void {
    if (epoch !== this.epoch || this.serverLimited) {
      return;
    }
    if (!Number.isFinite(this.allowance)) {
      return;
    }
    this.allowance += 1;
    if (this.allowance > 0) {
      this.blockedUntil = 0;
    }
  }

  /**
   * Record a repo-call response. `epoch` ignores results from a previous
   * credential (anon 403 landing after the user signed in).
   */
  observe(
    status: number,
    headers: Headers,
    body: string | undefined,
    epoch: number,
  ): void {
    if (epoch !== this.epoch) {
      return;
    }
    const remaining = headers.get("x-ratelimit-remaining");
    let serverExhausted = false;
    if (remaining === "0") {
      const until = resetMsFromHeaders(headers, this.now());
      this.allowance = 0;
      if (until !== undefined) {
        this.blockedUntil = Math.max(this.blockedUntil, until);
        this.allowanceResetAt = this.blockedUntil;
      }
      serverExhausted = true;
    }
    if (isGithubRateLimitResponse(status, headers, body)) {
      this.allowance = 0;
      const until = blockedUntilFromRateLimit(headers, this.now());
      this.blockedUntil = Math.max(this.blockedUntil, until);
      this.allowanceResetAt = this.blockedUntil;
      serverExhausted = true;
    }
    if (serverExhausted) {
      this.serverLimited = true;
      this.limitVersion += 1;
    }
  }

  async acquire(): Promise<GithubSlot> {
    const denied = this.denial();
    if (denied) {
      return denied;
    }

    const turn = this.chain.then(async () => {
      const deniedNow = this.denial();
      if (deniedNow) {
        return deniedNow;
      }
      const wait = Math.max(0, this.nextStartAt - this.now());
      if (wait > 0) {
        await this.sleep(wait);
      }
      const deniedAfter = this.denial();
      if (deniedAfter) {
        return deniedAfter;
      }
      if (this.allowance <= 0) {
        this.armAllowanceBlock();
        return (
          this.denial() ?? {
            ok: false as const,
            retryAfterMs: DEFAULT_BACKOFF_MS,
          }
        );
      }
      this.allowance -= 1;
      this.nextStartAt =
        this.now() + (this.options.minIntervalMs ?? MIN_INTERVAL_MS);
      return {
        ok: true as const,
        epoch: this.epoch,
        limitVersion: this.limitVersion,
      };
    });
    this.chain = turn.then(
      () => undefined,
      () => undefined,
    );
    const result = await turn;
    if (!result.ok) {
      return result;
    }

    const release = await this.takeSlot();
    if (this.epoch !== result.epoch) {
      release();
      return { ok: false, retryAfterMs: 0 };
    }
    if (this.limitVersion !== result.limitVersion) {
      release();
      if (Number.isFinite(this.allowance)) {
        this.allowance += 1;
      }
      return (
        this.denial() ?? { ok: false, retryAfterMs: DEFAULT_BACKOFF_MS }
      );
    }
    if (this.allowance <= 0) {
      this.armAllowanceBlock();
    }
    return { ok: true, release, epoch: result.epoch };
  }

  private endProbe(): void {
    this.probing = false;
    const resolve = this.resolveProbe;
    this.resolveProbe = undefined;
    resolve?.();
  }

  private denial(): { ok: false; retryAfterMs: number } | undefined {
    const now = this.now();
    if (now < this.blockedUntil) {
      return { ok: false, retryAfterMs: this.blockedUntil - now };
    }
    if (this.allowance <= 0 && this.allowanceResetAt > now) {
      this.blockedUntil = this.allowanceResetAt;
      return { ok: false, retryAfterMs: this.allowanceResetAt - now };
    }
    if (
      this.allowance <= 0 &&
      this.allowanceResetAt !== 0 &&
      this.allowanceResetAt <= now
    ) {
      this.allowance = Number.POSITIVE_INFINITY;
      this.allowanceResetAt = 0;
    }
    return undefined;
  }

  private armAllowanceBlock(): void {
    if (this.allowance > 0) {
      return;
    }
    if (this.allowanceResetAt > this.now()) {
      this.blockedUntil = Math.max(this.blockedUntil, this.allowanceResetAt);
    }
  }

  private takeSlot(): Promise<() => void> {
    const max = this.options.maxInFlight ?? MAX_IN_FLIGHT;
    if (this.inFlight < max) {
      this.inFlight += 1;
      return Promise.resolve(this.makeRelease());
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    }).then(() => {
      this.inFlight += 1;
      return this.makeRelease();
    });
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.inFlight -= 1;
      this.waiters.shift()?.();
    };
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return (
      this.options.sleep?.(ms) ??
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      })
    );
  }
}

export const sharedGithubBudget = new GithubBudget();

export function isGithubRateLimitResponse(
  status: number,
  headers: Headers,
  body: string | undefined,
): boolean {
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  if (headers.get("x-ratelimit-remaining") === "0") {
    return true;
  }
  if (headers.get("retry-after")) {
    return true;
  }
  return Boolean(body && /rate limit/i.test(body));
}

export function githubRetryAfterMs(
  headers: Headers,
  now = Date.now(),
): number {
  return Math.max(0, blockedUntilFromRateLimit(headers, now) - now);
}

export function formatGithubResetClock(blockedUntilMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(blockedUntilMs));
}

function blockedUntilFromRateLimit(headers: Headers, now: number): number {
  const retryAfter = retryAfterMs(headers, now);
  if (retryAfter !== undefined) {
    return now + retryAfter;
  }
  const reset = resetMsFromHeaders(headers, now);
  if (reset !== undefined) {
    return reset;
  }
  return now + DEFAULT_BACKOFF_MS;
}

function resetMsFromHeaders(headers: Headers, now: number): number | undefined {
  const raw = headers.get("x-ratelimit-reset");
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) {
    return undefined;
  }
  const resetMs = seconds * 1000;
  return resetMs > now ? resetMs : undefined;
}

function retryAfterMs(headers: Headers, now: number): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    return Math.max(0, date - now);
  }
  return undefined;
}

function tokenIdentity(token: string | undefined): string {
  const trimmed = token?.trim();
  if (!trimmed) {
    return "anon";
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `t${hash >>> 0}`;
}
