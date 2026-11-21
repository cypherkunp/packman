import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPool } from "./mapPool";

describe("mapPool", () => {
  it("bounds concurrency", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight -= 1;
      return n * 2;
    });
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.ok(maxInflight <= 2);
    assert.ok(maxInflight >= 2);
  });

  it("stops scheduling after abort", async () => {
    const controller = new AbortController();
    let started = 0;
    await mapPool(
      [1, 2, 3, 4],
      1,
      async (n) => {
        started += 1;
        if (n === 1) {
          controller.abort();
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        return n;
      },
      controller.signal,
    );
    assert.equal(started, 1);
  });
});
