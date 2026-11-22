import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichDependencyEager,
  enrichDependencyGithub,
} from "./enrichDependency";
import { EnrichmentCache } from "./enrichmentCache";
import { GithubBudget } from "./githubBudget";

describe("enrichDependencyEager", () => {
  it("fills latest and the repo link without any GitHub request", async () => {
    const urls: string[] = [];
    const enriched = await enrichDependencyEager(
      { name: "left-pad", range: "^1.0.0" },
      {
        fetchImpl: async (url) => {
          urls.push(url);
          return leftPadNpm();
        },
      },
    );

    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
    assert.equal(enriched.openIssuesCount, undefined);
    assert.deepEqual(
      urls.filter((url) => url.includes("api.github.com")),
      [],
    );
    assert.equal(urls.length, 1);
  });
});

describe("enrichDependencyGithub", () => {
  const eagerLeftPad = {
    name: "left-pad",
    range: "^1.0.0",
    npmUrl: "https://www.npmjs.com/package/left-pad",
    latest: "1.3.0",
    githubRepo: "stevemao/left-pad",
    githubUrl: "https://github.com/stevemao/left-pad",
    issuesUrl: "https://github.com/stevemao/left-pad/issues",
  };

  it("fills open issues/PRs from GitHub without calling npm", async () => {
    const urls: string[] = [];
    const enriched = await enrichDependencyGithub(eagerLeftPad, {
      fetchImpl: async (url) => {
        urls.push(url);
        return leftPadRepo(7);
      },
    });
    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.openIssuesCount, 7);
    assert.deepEqual(urls, ["https://api.github.com/repos/stevemao/left-pad"]);
  });

  it("degrades without a request while the GitHub budget is blocked", async () => {
    const budget = new GithubBudget({ now: () => 1_000 });
    budget.noteCoreLimit(0, 3_600);
    let calls = 0;
    const enriched = await enrichDependencyGithub(eagerLeftPad, {
      githubBudget: budget,
      fetchImpl: async () => {
        calls += 1;
        return leftPadRepo(7);
      },
    });
    assert.equal(calls, 0);
    assert.equal(enriched.issuesDegrade, "rate_limited");
    assert.equal(enriched.openIssuesCount, undefined);
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
  });

  it("serves a second lookup from the cache", async () => {
    const cache = new EnrichmentCache<unknown>();
    let calls = 0;
    const options = {
      cache,
      fetchImpl: async () => {
        calls += 1;
        return leftPadRepo(7);
      },
    };
    await enrichDependencyGithub(eagerLeftPad, options);
    const again = await enrichDependencyGithub(eagerLeftPad, options);
    assert.equal(calls, 1);
    assert.equal(again.openIssuesCount, 7);
  });

  it("does nothing for a Dependency without a GitHub repo", async () => {
    let calls = 0;
    const enriched = await enrichDependencyGithub(
      { name: "x", range: "1", npmUrl: "https://www.npmjs.com/package/x" },
      {
        fetchImpl: async () => {
          calls += 1;
          return leftPadRepo(1);
        },
      },
    );
    assert.equal(calls, 0);
    assert.equal(enriched.openIssuesCount, undefined);
  });
});

function leftPadRepo(openIssues: number): Response {
  return jsonResponse({
    html_url: "https://github.com/stevemao/left-pad",
    open_issues_count: openIssues,
  });
}

function leftPadNpm(): Response {
  return jsonResponse({
    version: "1.3.0",
    repository: { url: "git+https://github.com/stevemao/left-pad.git" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
