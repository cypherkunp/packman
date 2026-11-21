import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GithubBudget } from "./githubBudget";

describe("GithubBudget", () => {
  it("spaces calls and then stops when the probed allowance is spent", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const budget = new GithubBudget({
      minIntervalMs: 100,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    budget.noteCoreLimit(1, 500);

    const first = await budget.acquire();
    const second = await budget.acquire();
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.ok(second.retryAfterMs > 0);
    }
    assert.deepEqual(sleeps, []);
    if (first.ok) {
      first.release();
    }
  });

  it("waits out the minimum interval between starts", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const budget = new GithubBudget({
      minIntervalMs: 100,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    const first = await budget.acquire();
    const second = await budget.acquire();
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.deepEqual(sleeps, [100]);
    if (first.ok) {
      first.release();
    }
    if (second.ok) {
      second.release();
    }
  });

  it("clears a block when the credential changes and ignores stale 403s", async () => {
    const budget = new GithubBudget({
      minIntervalMs: 0,
      now: () => 0,
      sleep: async () => undefined,
    });
    budget.noteCoreLimit(0, 100);
    const denied = await budget.acquire();
    assert.equal(denied.ok, false);

    const granted = await budget.acquire();
    assert.equal(granted.ok, false);

    budget.setIdentity("pat-token");
    const slot = await budget.acquire();
    assert.equal(slot.ok, true);
    if (!slot.ok) {
      return;
    }
    budget.observe(
      403,
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "100",
      }),
      "API rate limit exceeded",
      slot.epoch,
    );
    slot.release();

    budget.setIdentity(undefined);
    budget.observe(
      403,
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "100",
      }),
      "API rate limit exceeded",
      slot.epoch,
    );
    const afterStale = await budget.acquire();
    assert.equal(afterStale.ok, true);
    if (afterStale.ok) {
      afterStale.release();
    }
  });

  it("returns a reserved unit when no request was sent", async () => {
    const budget = new GithubBudget({
      minIntervalMs: 0,
      now: () => 0,
      sleep: async () => undefined,
    });
    budget.noteCoreLimit(1, 500);
    const slot = await budget.acquire();
    assert.equal(slot.ok, true);
    if (!slot.ok) {
      return;
    }
    slot.release();
    budget.refund(slot.epoch);
    const again = await budget.acquire();
    assert.equal(again.ok, true);
    if (again.ok) {
      again.release();
    }
  });

  it("caps in-flight GitHub calls", async () => {
    const budget = new GithubBudget({
      minIntervalMs: 0,
      maxInFlight: 1,
      sleep: async () => undefined,
    });
    const first = await budget.acquire();
    assert.equal(first.ok, true);
    let entered = false;
    const second = budget.acquire().then((slot) => {
      entered = true;
      return slot;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(entered, false);
    if (first.ok) {
      first.release();
    }
    const slot = await second;
    assert.equal(slot.ok, true);
    if (slot.ok) {
      slot.release();
    }
  });
});
