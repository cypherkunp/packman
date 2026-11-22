import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnrichmentRefresh } from "./enrichmentRefresh";

describe("EnrichmentRefresh", () => {
  it("clears shared enrichment once, however many surfaces listen", () => {
    let clears = 0;
    const refresh = new EnrichmentRefresh(() => {
      clears += 1;
    });
    const heard: string[] = [];
    refresh.onRefresh(() => heard.push("hover"));
    refresh.onRefresh(() => heard.push("overlay"));

    refresh.refresh();

    assert.equal(clears, 1);
    assert.deepEqual(heard, ["hover", "overlay"]);
  });

  it("clears before any listener starts refetching", () => {
    const order: string[] = [];
    const refresh = new EnrichmentRefresh(() => order.push("clear"));
    refresh.onRefresh(() => order.push("refetch"));

    refresh.refresh();

    assert.deepEqual(order, ["clear", "refetch"]);
  });

  it("stops notifying a listener once it is disposed", () => {
    const refresh = new EnrichmentRefresh(() => undefined);
    let heard = 0;
    const subscription = refresh.onRefresh(() => {
      heard += 1;
    });

    subscription.dispose();
    refresh.refresh();

    assert.equal(heard, 0);
  });
});
