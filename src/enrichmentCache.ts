/**
 * In-memory enrichment cache with TTL.
 * Default TTL: 1 hour (documented for npm / GitHub / Socket responses).
 */
export const ENRICHMENT_TTL_MS = 60 * 60 * 1000;

export type CacheHit<T> = {
  value: T;
  stale: boolean;
};

export type CacheBlock = {
  blockedUntil: number;
  retryAfterMs: number;
};

export type EnrichmentCacheOptions = {
  ttlMs?: number;
  now?: () => number;
};

type Entry<T> = {
  value: T;
  storedAt: number;
};

export class EnrichmentCache<T> {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, Entry<T>>();
  private readonly blocks = new Map<string, number>();

  constructor(options: EnrichmentCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? ENRICHMENT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  get(key: string): CacheHit<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    const age = this.now() - entry.storedAt;
    return { value: entry.value, stale: age > this.ttlMs };
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, storedAt: this.now() });
  }

  clear(): void {
    this.entries.clear();
    this.blocks.clear();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  blockUntil(key: string, blockedUntil: number): void {
    this.blocks.set(key, blockedUntil);
  }

  getBlock(key: string): CacheBlock | undefined {
    const blockedUntil = this.blocks.get(key);
    if (blockedUntil === undefined) {
      return undefined;
    }
    const now = this.now();
    if (now >= blockedUntil) {
      this.blocks.delete(key);
      return undefined;
    }
    return { blockedUntil, retryAfterMs: blockedUntil - now };
  }
}

export function enrichmentCacheKey(
  kind: "npm" | "github" | "socket",
  id: string,
): string {
  return `${kind}:${id}`;
}
