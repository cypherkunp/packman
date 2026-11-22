import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchGithubRepoSummary,
} from "./fetchGithubRepoSummary";

describe("fetchGithubRepoSummary", () => {
  it("returns html_url and open_issues_count", async () => {
    const result = await fetchGithubRepoSummary(
      "lodash/lodash",
      undefined,
      async (url, init) => {
        assert.equal(url, "https://api.github.com/repos/lodash/lodash");
        assert.equal(
          (init?.headers as Record<string, string>)["Accept"],
          "application/vnd.github+json",
        );
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          undefined,
        );
        assert.equal(
          (init?.headers as Record<string, string>)["X-GitHub-Api-Version"],
          "2022-11-28",
        );
        return jsonResponse({
          html_url: "https://github.com/lodash/lodash",
          open_issues_count: 42,
        });
      },
    );
    assert.deepEqual(result, {
      status: "ok",
      htmlUrl: "https://github.com/lodash/lodash",
      openIssuesCount: 42,
    });
  });

  it("sends optional PAT and degrades on 403/429", async () => {
    const ok = await fetchGithubRepoSummary(
      "a/b",
      "token-xyz",
      async (_url, init) => {
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer token-xyz",
        );
        return jsonResponse({
          html_url: "https://github.com/a/b",
          open_issues_count: 1,
        });
      },
    );
    assert.equal(ok.status, "ok");

    const limited = await fetchGithubRepoSummary(
      "a/b",
      undefined,
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 120),
          },
        }),
    );
    assert.equal(limited.status, "rate_limited");
    if (limited.status === "rate_limited") {
      assert.ok((limited.retryAfterMs ?? 0) >= 100_000);
      assert.ok((limited.retryAfterMs ?? 0) <= 130_000);
    }

    const forbidden = await fetchGithubRepoSummary("a/b", undefined, async () =>
      new Response(JSON.stringify({ message: "Resource not accessible" }), {
        status: 403,
      }),
    );
    assert.equal(forbidden.status, "error");
  });

});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
