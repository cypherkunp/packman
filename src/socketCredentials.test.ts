import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSocketCredentials } from "./socketCredentials";

describe("resolveSocketCredentials", () => {
  it("requires both api token and org slug", () => {
    assert.deepEqual(resolveSocketCredentials(undefined, undefined), {
      status: "missing",
    });
    assert.deepEqual(resolveSocketCredentials("tok", ""), {
      status: "missing",
    });
    assert.deepEqual(resolveSocketCredentials("", "my-org"), {
      status: "missing",
    });
    assert.deepEqual(resolveSocketCredentials("  tok  ", " my-org "), {
      status: "ready",
      apiToken: "tok",
      orgSlug: "my-org",
    });
  });
});
