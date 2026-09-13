import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePackageDocument } from "./parsePackageDocument";

describe("parsePackageDocument", () => {
  it("parses a valid package.json object", () => {
    const result = parsePackageDocument(
      JSON.stringify({ name: "demo", version: "1.0.0" }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.name, "demo");
      assert.equal(result.value.version, "1.0.0");
    }
  });

  it("rejects invalid JSON", () => {
    const result = parsePackageDocument("{");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /JSON/i);
    }
  });

  it("rejects non-object roots", () => {
    const result = parsePackageDocument("[]");
    assert.equal(result.ok, false);
  });
});
