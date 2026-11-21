import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimGitDiffHandoff,
  gitDiffResourceKey,
  gitRef,
  isGitDiffHandoffClaimed,
  isGitDiffTabLabel,
  pickGitDiffSides,
  releaseGitDiffHandoff,
  type DiffResource,
} from "./gitDiffMode";

const file: DiffResource = {
  scheme: "file",
  fsPath: "/repo/package.json",
  query: "",
};

function git(ref: string, path = "/repo/package.json"): DiffResource {
  return {
    scheme: "git",
    fsPath: path,
    query: JSON.stringify({ path, ref }),
  };
}

describe("git diff resource identity", () => {
  it("keys a git URI by the file path in the query", () => {
    assert.equal(gitDiffResourceKey(git("~")), file.fsPath);
    assert.equal(gitRef(git("HEAD")), "HEAD");
    assert.equal(gitRef(git("")), "");
    assert.equal(gitRef(file), undefined);
  });
});

describe("isGitDiffTabLabel", () => {
  it("matches SCM and history diff titles for this file only", () => {
    assert.equal(isGitDiffTabLabel("package.json", "package.json (Working Tree)"), true);
    assert.equal(isGitDiffTabLabel("package.json", "package.json (Index)"), true);
    assert.equal(
      isGitDiffTabLabel("package.json", "package.json (abc) ↔ package.json (def)"),
      true,
    );
    assert.equal(isGitDiffTabLabel("package.json", "package.json"), false);
    assert.equal(isGitDiffTabLabel("package.json", "other.json (Working Tree)"), false);
  });
});

describe("pickGitDiffSides", () => {
  it("pairs a working-tree file with the git index side", () => {
    const original = git("~");
    const sides = pickGitDiffSides([file, original]);
    assert.equal(sides?.original, original);
    assert.equal(sides?.modified, file);
  });

  it("pairs an index diff as HEAD → empty ref", () => {
    const head = git("HEAD");
    const index = git("");
    const sides = pickGitDiffSides([index, head]);
    assert.equal(sides?.original, head);
    assert.equal(sides?.modified, index);
  });

  it("returns undefined until both sides exist", () => {
    assert.equal(pickGitDiffSides([file]), undefined);
    assert.equal(pickGitDiffSides([git("~")]), undefined);
  });
});

describe("git diff handoff claim", () => {
  it("lets one side lead and the other follow", () => {
    const key = "/repo/package.json#claim";
    releaseGitDiffHandoff(key);
    assert.equal(claimGitDiffHandoff(key), "leader");
    assert.equal(isGitDiffHandoffClaimed(key), true);
    assert.equal(claimGitDiffHandoff(key), "follower");
    releaseGitDiffHandoff(key);
    assert.equal(isGitDiffHandoffClaimed(key), false);
  });
});
