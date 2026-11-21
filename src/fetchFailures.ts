export type FetchFailureKind = "timeout" | "offline" | "error";

export const REQUEST_TIMEOUT_MS = 12_000;

export function parseRetryAfterMs(
  headers: Headers,
  now = Date.now(),
): number | undefined {
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

/** Per-call timeout, also aborted when `parent` aborts (stale enrichment). */
export function requestSignal(
  parent?: AbortSignal | null,
  timeoutMs = REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!parent) {
    return timeout;
  }
  if (parent.aborted) {
    return parent;
  }
  const controller = new AbortController();
  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };
  parent.addEventListener("abort", () => abortFrom(parent), { once: true });
  timeout.addEventListener("abort", () => abortFrom(timeout), { once: true });
  return controller.signal;
}

export function classifyFetchFailure(error: unknown): FetchFailureKind {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "timeout";
  }
  if (error instanceof TypeError) {
    return "offline";
  }
  return "error";
}
