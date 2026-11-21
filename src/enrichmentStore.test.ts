import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnrichmentCache } from "./enrichmentCache";
import { EnrichmentStore } from "./enrichmentStore";
import type { FetchLike } from "./fetchNpmLatest";
import { GithubBudget } from "./githubBudget";

describe("EnrichmentStore", () => {
  it("does not refetch a Dependency whose range changed but name didn't", async () => {
    const fake = fakeRegistry();
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });

    await store.enrichEager([{ name: "left-pad", range: "^1.0.0" }]);
    const again = await store.enrichEager([
      { name: "left-pad", range: "^1.3.0" },
    ]);

    assert.equal(fake.calls.length, 1);
    assert.equal(again.get("left-pad")?.range, "^1.3.0");
    assert.equal(again.get("left-pad")?.latest, "1.3.0");
  });

  it("fetches npm and one Socket batch eagerly, with no GitHub request", async () => {
    const fake = fakeRegistry();
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });

    const result = await store.enrichEager(
      [
        { name: "left-pad", range: "^1.0.0" },
        { name: "right-pad", range: "^2.0.0" },
      ],
      { socket: { status: "ready", apiToken: "t", orgSlug: "acme" } },
    );

    assert.deepEqual(
      fake.calls.filter((url) => url.includes("api.github.com")),
      [],
    );
    assert.equal(
      fake.calls.filter((url) => url.includes("api.socket.dev")).length,
      1,
    );
    assert.deepEqual(result.get("left-pad")?.socket, {
      kind: "score",
      overall100: 81,
      highSeverity: false,
      url: "https://socket.dev/npm/package/left-pad",
    });
    assert.deepEqual(result.get("right-pad")?.socket, { kind: "empty" });
  });

  it("marks Socket as a call to action when it isn't configured", async () => {
    const fake = fakeRegistry();
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });
    const result = await store.enrichEager(
      [{ name: "left-pad", range: "^1.0.0" }],
      { socket: { status: "missing" } },
    );
    assert.deepEqual(result.get("left-pad")?.socket, { kind: "cta" });
    assert.equal(
      fake.calls.filter((url) => url.includes("api.socket.dev")).length,
      0,
    );
  });

  it("loads GitHub data for one Dependency once and shares it", async () => {
    const fake = fakeRegistry();
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });
    const row = { name: "left-pad", range: "^1.0.0" };

    await store.enrichEager([row]);
    const [first, second] = await Promise.all([
      store.enrichGithub(row),
      store.enrichGithub({ ...row, range: "^1.2.0" }),
    ]);
    const later = await store.enrichEager([row]);

    assert.equal(first.openIssuesCount, 7);
    assert.equal(second.openIssuesCount, 7);
    assert.equal(second.range, "^1.2.0");
    assert.equal(later.get("left-pad")?.openIssuesCount, 7);
    assert.equal(
      fake.calls.filter((url) => url.includes("api.github.com")).length,
      1,
    );
    assert.equal(
      fake.calls.filter((url) => url.includes("registry.npmjs.org")).length,
      1,
    );
  });

  it("returns a degraded GitHub result while the budget is blocked", async () => {
    const fake = fakeRegistry();
    const budget = new GithubBudget({ now: () => 1_000 });
    budget.noteCoreLimit(0, 3_600);
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });

    const enriched = await store.enrichGithub(
      { name: "left-pad", range: "^1.0.0" },
      { githubBudget: budget },
    );

    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.issuesDegrade, "rate_limited");
    assert.equal(
      fake.calls.filter((url) => url.includes("api.github.com")).length,
      0,
    );
  });

  it("reuses a degraded eager row instead of refetching npm for GitHub", async () => {
    let npmCalls = 0;
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: async (url) => {
        if (url.includes("registry.npmjs.org")) {
          npmCalls += 1;
          throw new TypeError("fetch failed");
        }
        throw new Error(`unexpected ${url}`);
      },
    });
    const row = { name: "left-pad", range: "^1.0.0" };
    const eager = await store.enrichEager([row]);
    const github = await store.enrichGithub(row);
    assert.equal(eager.get("left-pad")?.latestDegrade, "offline");
    assert.equal(github.latestDegrade, "offline");
    assert.equal(npmCalls, 1);
  });

  it("refetches after clear()", async () => {
    const fake = fakeRegistry();
    const store = new EnrichmentStore({
      cache: new EnrichmentCache<unknown>(),
      fetchImpl: fake.fetch,
    });
    const row = { name: "left-pad", range: "^1.0.0" };
    await store.enrichEager([row]);
    store.clear();
    await store.enrichEager([row], { forceRefresh: true });
    assert.equal(fake.calls.length, 2);
  });
});

function fakeRegistry(): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    if (url.includes("api.github.com")) {
      return json({
        html_url: "https://github.com/stevemao/left-pad",
        open_issues_count: 7,
      });
    }
    if (url.includes("api.socket.dev")) {
      return json([
        {
          purl: "pkg:npm/left-pad@1.3.0",
          score: { overall: 0.81 },
          alerts: [],
        },
      ]);
    }
    return json({
      version: "1.3.0",
      repository: { url: "git+https://github.com/stevemao/left-pad.git" },
    });
  };
  return { fetch: fetchImpl, calls };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
