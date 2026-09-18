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
});
