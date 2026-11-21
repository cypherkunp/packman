import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldFetchGithubOnHover } from "./githubOnHover";

const loaded = {
  githubUrl: "https://github.com/a/left-pad",
  issuesUrl: "https://github.com/a/left-pad/issues",
  openIssuesCount: 3,
};

describe("shouldFetchGithubOnHover", () => {
  it("fetches a Dependency whose GitHub data hasn't loaded", () => {
    assert.equal(shouldFetchGithubOnHover(undefined, false), true);
  });

  it("reuses loaded GitHub data", () => {
    assert.equal(shouldFetchGithubOnHover(loaded, false), false);
  });

  it("shows an offline or timed-out failure without retrying", () => {
    assert.equal(
      shouldFetchGithubOnHover({ githubDegrade: "offline" }, false),
      false,
    );
    assert.equal(
      shouldFetchGithubOnHover(
        { ...loaded, openIssuesCount: undefined, issuesDegrade: "timeout" },
        false,
      ),
      false,
    );
  });

  it("waits out a rate limit while the budget is blocked", () => {
    assert.equal(
      shouldFetchGithubOnHover({ githubDegrade: "rate_limited" }, true),
      false,
    );
  });

  it("retries a rate-limited Dependency once the budget resumes", () => {
    assert.equal(
      shouldFetchGithubOnHover({ githubDegrade: "rate_limited" }, false),
      true,
    );
    assert.equal(
      shouldFetchGithubOnHover({ ...loaded, issuesDegrade: "rate_limited" }, false),
      true,
    );
  });
});
