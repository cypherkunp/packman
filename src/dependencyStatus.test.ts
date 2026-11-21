import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dependencyStatus, nonRegistrySource } from "./dependencyStatus";

describe("dependencyStatus", () => {
  it("treats latest inside the range as current", () => {
    assert.deepEqual(dependencyStatus("^18.2.0", "18.3.1"), { kind: "current" });
    assert.deepEqual(dependencyStatus("~1.2.0", "1.2.9"), { kind: "current" });
    assert.deepEqual(dependencyStatus(">=18", "22.1.0"), { kind: "current" });
    assert.deepEqual(dependencyStatus("*", "3.0.0"), { kind: "current" });
    assert.deepEqual(dependencyStatus("1.x", "1.9.0"), { kind: "current" });
    assert.deepEqual(dependencyStatus("1.3.0", "1.3.0"), { kind: "current" });
    assert.deepEqual(dependencyStatus("^1.0.0 || ^2.0.0", "2.4.0"), {
      kind: "current",
    });
    assert.deepEqual(dependencyStatus("1.0.0 - 2.x", "2.9.9"), {
      kind: "current",
    });
  });

  it("flags a major jump outside a caret range as breaking", () => {
    assert.deepEqual(dependencyStatus("^18.2.0", "19.2.0"), {
      kind: "behind",
      gap: "major",
      breaking: true,
    });
  });

  it("labels pinned versions by the size of the gap", () => {
    assert.deepEqual(dependencyStatus("1.3.0", "1.4.2"), {
      kind: "behind",
      gap: "minor",
      breaking: false,
    });
    assert.deepEqual(dependencyStatus("~1.2.0", "1.3.0"), {
      kind: "behind",
      gap: "minor",
      breaking: false,
    });
    assert.deepEqual(dependencyStatus("1.2.3", "1.2.4"), {
      kind: "behind",
      gap: "patch",
      breaking: false,
    });
  });

  it("treats 0.x minor bumps as breaking", () => {
    assert.deepEqual(dependencyStatus("^0.2.1", "0.3.0"), {
      kind: "behind",
      gap: "minor",
      breaking: true,
    });
  });

  it("does not flag latest below the declared floor", () => {
    assert.deepEqual(dependencyStatus("^3.0.0-beta.1", "2.9.0"), {
      kind: "unknown",
    });
  });

  it("recognises ranges that do not come from the registry", () => {
    assert.deepEqual(dependencyStatus("workspace:*", undefined), {
      kind: "non-registry",
      source: "workspace",
    });
    assert.equal(nonRegistrySource("file:../lib"), "local");
    assert.equal(nonRegistrySource("catalog:"), "catalog");
    assert.equal(nonRegistrySource("npm:other@^1.0.0"), "alias");
    assert.equal(nonRegistrySource("github:owner/repo"), "git");
    assert.equal(nonRegistrySource("owner/repo#main"), "git");
    assert.equal(nonRegistrySource("https://example.com/x.tgz"), "url");
    assert.equal(nonRegistrySource("^1.0.0"), undefined);
  });

  it("returns unknown without a usable latest", () => {
    assert.deepEqual(dependencyStatus("^1.0.0", undefined), { kind: "unknown" });
    assert.deepEqual(dependencyStatus("^1.0.0", "garbage"), { kind: "unknown" });
  });
});
