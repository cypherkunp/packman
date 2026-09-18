import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnrichmentCache } from "./enrichmentCache";

describe("EnrichmentCache", () => {
  it("returns fresh values within TTL and marks stale after", () => {
    let now = 1_000;
    const cache = new EnrichmentCache<string>({
      ttlMs: 1_000,
      now: () => now,
    });
    cache.set("a", "one");
    assert.deepEqual(cache.get("a"), { value: "one", stale: false });
    now = 1_500;
    assert.deepEqual(cache.get("a"), { value: "one", stale: false });
    now = 2_001;
    assert.deepEqual(cache.get("a"), { value: "one", stale: true });
  });

  it("misses unknown keys", () => {
    const cache = new EnrichmentCache<string>({ ttlMs: 1_000, now: () => 0 });
    assert.equal(cache.get("missing"), undefined);
  });

  it("clear removes entries", () => {
    const cache = new EnrichmentCache<string>({ ttlMs: 1_000, now: () => 0 });
    cache.set("a", "one");
    cache.clear();
    assert.equal(cache.get("a"), undefined);
  });

  it("honors Retry-After blocked until timestamps", () => {
    let now = 1_000;
    const cache = new EnrichmentCache<string>({
      ttlMs: 60_000,
      now: () => now,
    });
    cache.blockUntil("npm:left-pad", 5_000);
    assert.deepEqual(cache.getBlock("npm:left-pad"), {
      blockedUntil: 5_000,
      retryAfterMs: 4_000,
    });
    now = 5_000;
    assert.equal(cache.getBlock("npm:left-pad"), undefined);
  });
});
