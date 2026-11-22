import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bump, levelFor } from "./bump-version.mjs";

describe("levelFor", () => {
  it("maps feat to minor, fix and perf to patch, others to no bump", () => {
    assert.equal(levelFor("feat: add thing"), "minor");
    assert.equal(levelFor("fix(ui): repair thing"), "patch");
    assert.equal(levelFor("perf: faster"), "patch");
    assert.equal(levelFor("docs: words"), null);
    assert.equal(levelFor("Merge branch 'x'"), null);
  });

  it("treats ! and a BREAKING CHANGE footer as major", () => {
    assert.equal(levelFor("feat!: drop thing"), "major");
    assert.equal(levelFor("fix: thing\n\nBREAKING CHANGE: gone"), "major");
  });
});

describe("bump", () => {
  it("bumps major, minor and patch from 1.0.0 and up", () => {
    assert.equal(bump("1.2.3", "major"), "2.0.0");
    assert.equal(bump("1.2.3", "minor"), "1.3.0");
    assert.equal(bump("1.2.3", "patch"), "1.2.4");
  });

  it("treats a breaking change as minor before 1.0.0", () => {
    assert.equal(bump("0.0.4", "major"), "0.1.0");
    assert.equal(bump("0.3.2", "major"), "0.4.0");
  });

  it("bumps minor and patch normally before 1.0.0", () => {
    assert.equal(bump("0.1.0", "minor"), "0.2.0");
    assert.equal(bump("0.1.0", "patch"), "0.1.1");
  });
});
