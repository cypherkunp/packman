import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeGithubRepo } from "./normalizeGithubRepo";

describe("normalizeGithubRepo", () => {
  it("normalizes common npm repository URL shapes", () => {
    assert.equal(
      normalizeGithubRepo("git+https://github.com/lodash/lodash.git"),
      "lodash/lodash",
    );
    assert.equal(
      normalizeGithubRepo("git+ssh://git@github.com/stevemao/left-pad.git"),
      "stevemao/left-pad",
    );
    assert.equal(
      normalizeGithubRepo({
        type: "git",
        url: "git+https://github.com/expressjs/express.git",
      }),
      "expressjs/express",
    );
  });

  it("accepts github shortcuts and bare owner/repo", () => {
    assert.equal(normalizeGithubRepo("github:npm/cli"), "npm/cli");
    assert.equal(normalizeGithubRepo("npm/cli"), "npm/cli");
  });

  it("rejects non-GitHub hosts and garbage", () => {
    assert.equal(
      normalizeGithubRepo("git+https://gitlab.com/foo/bar.git"),
      null,
    );
    assert.equal(normalizeGithubRepo("bitbucket:foo/bar"), null);
    assert.equal(normalizeGithubRepo(undefined), null);
    assert.equal(normalizeGithubRepo(42), null);
  });

  it("falls back to bugs.url when repository is missing", () => {
    assert.equal(
      normalizeGithubRepo(undefined, "https://github.com/lodash/lodash/issues"),
      "lodash/lodash",
    );
  });
});
