import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PACKMAN_VIEW_TYPE, resolveOpenWithViewId } from "./openWith";

describe("resolveOpenWithViewId", () => {
  it("targets native text editor when Packman UI mode is active", () => {
    assert.equal(
      resolveOpenWithViewId(PACKMAN_VIEW_TYPE),
      "default",
    );
  });

  it("targets Packman UI mode when Edit mode (or another editor) is active", () => {
    assert.equal(resolveOpenWithViewId(undefined), PACKMAN_VIEW_TYPE);
    assert.equal(resolveOpenWithViewId(""), PACKMAN_VIEW_TYPE);
    assert.equal(resolveOpenWithViewId("some.other.editor"), PACKMAN_VIEW_TYPE);
  });
});
