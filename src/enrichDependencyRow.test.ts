import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  enrichDependencyEager,
  enrichDependencyGithub,
  enrichDependencyRow,
} from "./enrichDependencyRow";
import { EnrichmentCache } from "./enrichmentCache";
import { GithubBudget } from "./githubBudget";

describe("enrichDependencyRow", () => {
  it("fills latest, GitHub link, and open issues when resolvable", async () => {
    const enriched = await enrichDependencyRow(
      { name: "left-pad", range: "^1.0.0" },
      {
        githubToken: undefined,
        fetchImpl: async (url) => {
          if (url.includes("registry.npmjs.org")) {
            return jsonResponse({
              version: "1.3.0",
              repository: {
                url: "git+ssh://git@github.com/stevemao/left-pad.git",
              },
            });
          }
          return jsonResponse({
            html_url: "https://github.com/stevemao/left-pad",
            open_issues_count: 7,
          });
        },
      },
    );

    assert.equal(enriched.name, "left-pad");
    assert.equal(enriched.range, "^1.0.0");
    assert.equal(enriched.npmUrl, "https://www.npmjs.com/package/left-pad");
    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
    assert.equal(enriched.issuesUrl, "https://github.com/stevemao/left-pad/issues");
    assert.equal(enriched.openIssuesCount, 7);
  });

  it("keeps npm repo URL and leaves issues empty on GitHub rate limit", async () => {
    const enriched = await enrichDependencyRow(
      { name: "left-pad", range: "^1.0.0" },
      {
        fetchImpl: async (url) => {
          if (url.includes("registry.npmjs.org")) {
            return jsonResponse({
              version: "1.3.0",
              repository: {
                url: "git+https://github.com/stevemao/left-pad.git",
              },
            });
          }
          return new Response("nope", { status: 429 });
        },
      },
    );
    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
    assert.equal(enriched.githubDegrade, undefined);
    assert.equal(enriched.issuesDegrade, "rate_limited");
    assert.equal(enriched.openIssuesCount, undefined);
  });

  it("degrades empty on npm 404", async () => {
    const enriched = await enrichDependencyRow(
      { name: "missing-pkg", range: "1.0.0" },
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      },
    );
    assert.equal(enriched.latest, undefined);
    assert.equal(enriched.githubUrl, undefined);
    assert.equal(enriched.openIssuesCount, undefined);
    assert.equal(enriched.npmUrl, "https://www.npmjs.com/package/missing-pkg");
  });
});

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
