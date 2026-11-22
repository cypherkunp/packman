import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnrichmentCache } from "./enrichmentCache";
import { EnrichmentStore } from "./enrichmentStore";
import type { FetchLike } from "./fetchNpmLatest";
import { GithubBudget } from "./githubBudget";
import { SignalFetchPolicy } from "./signalFetchPolicy";
import type { SocketCredentials } from "./socketCredentials";

const HOUR = 60 * 60 * 1000;

const PACKAGE = `{
  "name": "demo",
  "dependencies": {
    "alpha": "^1.0.0",
    "beta": "^1.0.0"
  },
  "devDependencies": {
    "gamma": "^1.0.0"
  }
}`;

const OTHER = `{
  "dependencies": { "delta": "^1.0.0" }
}`;

describe("SignalFetchPolicy", () => {
  it("fetches npm and GitHub for every Dependency of a shown package.json", async () => {
    const world = setup();

    await world.policy.shown([{ text: PACKAGE }]);

    assert.deepEqual(world.npmCalls().sort(), ["alpha", "beta", "gamma"]);
    assert.deepEqual(world.githubCalls().sort(), [
      "acme/alpha",
      "acme/beta",
      "acme/gamma",
    ]);
    assert.equal(world.policy.enrichment.get("alpha")?.latest, "1.0.0");
    assert.equal(world.policy.github.get("alpha")?.openIssuesCount, 5);
  });

  it("fetches Dependencies in the visible range first", async () => {
    const world = setup();

    // Only `gamma` (line 7) is on screen.
    await world.policy.shown([
      { text: PACKAGE, visibleRanges: [{ start: 7, end: 8 }] },
    ]);

    assert.equal(world.npmCalls()[0], "gamma");
    assert.equal(world.githubCalls()[0], "acme/gamma");
  });

  it("batches Socket in when it is configured", async () => {
    const world = setup({
      socket: { status: "ready", apiToken: "t", orgSlug: "acme" },
    });

    await world.policy.shown([{ text: PACKAGE }]);

    assert.equal(world.socketCalls(), 1);
  });

  it("makes no requests when shown again within the cache lifetime", async () => {
    const world = setup();
    await world.policy.shown([{ text: PACKAGE }]);
    const before = world.calls.length;

    world.advance(HOUR - 1);
    await world.policy.shown([{ text: PACKAGE }]);

    assert.equal(world.calls.length, before);
  });

  it("refetches an expired Dependency only once its file is shown again", async () => {
    const world = setup();
    await world.policy.shown([{ text: PACKAGE }]);
    const before = world.calls.length;

    world.advance(HOUR + 1);
    await world.policy.dependenciesTyped({ text: PACKAGE });
    assert.equal(world.calls.length, before);

    await world.policy.shown([{ text: PACKAGE }]);
    assert.deepEqual(world.npmCalls().slice(3).sort(), ["alpha", "beta", "gamma"]);
    assert.deepEqual(world.githubCalls().slice(3).sort(), [
      "acme/alpha",
      "acme/beta",
      "acme/gamma",
    ]);
  });

  it("fetches the new Dependencies an edit added, visible ones first", async () => {
    const world = setup();
    await world.policy.shown([{ text: PACKAGE }]);
    const edited = PACKAGE.replace(
      `"beta": "^1.0.0"`,
      `"beta": "^1.0.0",\n    "zeta": "^1.0.0"`,
    ).replace(`"gamma": "^1.0.0"`, `"gamma": "^1.0.0",\n    "eta": "^1.0.0"`);

    // Only `eta` (line 9) is on screen.
    await world.policy.dependenciesTyped({
      text: edited,
      visibleRanges: [{ start: 9, end: 10 }],
    });

    assert.deepEqual(world.npmCalls().slice(3), ["eta", "zeta"]);
    assert.deepEqual(world.githubCalls().slice(3), ["acme/eta", "acme/zeta"]);
  });

  it("stops GitHub requests once the budget runs out and marks the rest paused", async () => {
    const world = setup();
    // One request left until the reset, an hour from now.
    world.budget.noteCoreLimit(1, (world.nowMs() + HOUR) / 1000);

    await world.policy.shown([
      { text: PACKAGE, visibleRanges: [{ start: 3, end: 4 }] },
    ]);

    assert.deepEqual(world.githubCalls(), ["acme/alpha"]);
    assert.equal(world.policy.githubPaused, true);
    assert.equal(world.policy.github.get("alpha")?.openIssuesCount, 5);
    assert.equal(world.policy.github.get("alpha")?.issuesDegrade, undefined);
    for (const name of ["beta", "gamma"]) {
      assert.equal(world.policy.github.get(name)?.issuesDegrade, "rate_limited");
      assert.equal(world.policy.github.get(name)?.openIssuesCount, undefined);
      assert.equal(world.policy.enrichment.get(name)?.latest, "1.0.0");
    }
  });

  it("does not retry paused Dependencies when the budget resumes", async () => {
    const world = setup();
    world.budget.noteCoreLimit(0, (world.nowMs() + HOUR) / 1000);
    await world.policy.shown([{ text: PACKAGE }]);
    assert.deepEqual(world.githubCalls(), []);

    world.advance(HOUR + 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(world.policy.githubPaused, false);
    assert.deepEqual(world.githubCalls(), []);
  });

  it("does not re-fetch a paused Dependency on hover once the budget resumes", async () => {
    const world = setup();
    world.budget.noteCoreLimit(0, (world.nowMs() + HOUR) / 1000);
    await world.policy.shown([{ text: PACKAGE }]);

    world.advance(HOUR + 1);
    assert.equal(world.policy.githubPaused, false);
    await world.policy.hover({ name: "beta", range: "^1.0.0" });

    assert.deepEqual(world.githubCalls(), []);
    assert.equal(world.policy.github.get("beta")?.issuesDegrade, "rate_limited");
  });

  it("refreshes only the package.json editors it is given (the visible ones)", async () => {
    const world = setup();
    await world.policy.shown([{ text: PACKAGE }, { text: OTHER }]);
    const before = world.calls.length;

    await world.policy.refresh([{ text: OTHER }]);

    const after = world.calls.slice(before);
    assert.deepEqual(
      after.filter((url) => url.includes("registry.npmjs.org")).length,
      1,
    );
    assert.deepEqual(world.githubCalls().slice(-1), ["acme/delta"]);
    assert.equal(after.length, 2);
    assert.equal(world.policy.github.get("delta")?.openIssuesCount, 5);
    assert.equal(world.policy.enrichment.has("alpha"), false);
  });

  it("re-fetches only GitHub data, for the given editors, after signing in", async () => {
    let token: string | undefined;
    const world = setup({ githubToken: () => token });
    await world.policy.shown([{ text: PACKAGE }, { text: OTHER }]);
    const npmBefore = world.npmCalls().length;
    const githubBefore = world.githubCalls().length;

    token = "granted";
    await world.policy.signedIn([{ text: OTHER }]);

    assert.equal(world.npmCalls().length, npmBefore);
    assert.deepEqual(world.githubCalls().slice(githubBefore), ["acme/delta"]);
    assert.equal(world.policy.enrichment.get("alpha")?.latest, "1.0.0");
    assert.equal(world.policy.github.get("alpha")?.openIssuesCount, 5);
  });

  it("re-reads Socket for the given editors when its settings change", async () => {
    let socket: SocketCredentials = { status: "missing" };
    const world = setup({ socket: () => socket });
    await world.policy.shown([{ text: PACKAGE }, { text: OTHER }]);
    assert.equal(world.socketCalls(), 0);

    socket = { status: "ready", apiToken: "t", orgSlug: "acme" };
    await world.policy.socketChanged([{ text: OTHER }]);

    assert.equal(world.socketCalls(), 1);
    const socketBody = world.socketBodies()[0] ?? "";
    assert.match(socketBody, /delta/);
    assert.doesNotMatch(socketBody, /alpha/);
  });

  it("re-fetches Socket scores when its settings change, even if already scored", async () => {
    let socket: SocketCredentials = { status: "ready", apiToken: "t1", orgSlug: "acme" };
    const world = setup({ socket: () => socket });
    await world.policy.shown([{ text: OTHER }]);
    assert.equal(world.socketCalls(), 1);
    const npmBefore = world.npmCalls().length;
    const githubBefore = world.githubCalls().length;

    socket = { status: "ready", apiToken: "t2", orgSlug: "acme" };
    await world.policy.socketChanged([{ text: OTHER }]);

    assert.equal(world.socketCalls(), 2);
    assert.equal(world.npmCalls().length, npmBefore);
    assert.equal(world.githubCalls().length, githubBefore);
  });

  it("hovers read what was fetched and fetch only a never-fetched Dependency", async () => {
    const world = setup();
    await world.policy.shown([{ text: PACKAGE }]);
    const before = world.calls.length;

    await world.policy.hover({ name: "alpha", range: "^1.0.0" });
    assert.equal(world.calls.length, before);

    await world.policy.hover({ name: "delta", range: "^1.0.0" });
    assert.deepEqual(world.githubCalls().slice(-1), ["acme/delta"]);
    assert.equal(world.policy.github.get("delta")?.openIssuesCount, 5);
  });

  it("retries a failed npm lookup on Refresh, never on the next edit", async () => {
    const world = setup();
    world.setOffline(true);
    await world.policy.shown([{ text: OTHER }]);
    assert.equal(world.policy.enrichment.get("delta")?.latestDegrade, "offline");
    const before = world.calls.length;

    world.setOffline(false);
    await world.policy.dependenciesTyped({ text: OTHER });
    assert.equal(world.calls.length, before);
    assert.equal(world.policy.enrichment.get("delta")?.latestDegrade, "offline");

    await world.policy.refresh([{ text: OTHER }]);
    assert.equal(world.policy.enrichment.get("delta")?.latest, "1.0.0");
  });
});

type World = {
  policy: SignalFetchPolicy;
  calls: string[];
  npmCalls: () => string[];
  githubCalls: () => string[];
  socketCalls: () => number;
  socketBodies: () => string[];
  budget: GithubBudget;
  advance: (ms: number) => void;
  nowMs: () => number;
  setOffline: (value: boolean) => void;
  changes: () => number;
};

function setup(
  options: {
    socket?: SocketCredentials | (() => SocketCredentials);
    budget?: GithubBudget;
    githubToken?: () => string | undefined;
  } = {},
): World {
  let clock = 1_000_000;
  const now = () => clock;
  const calls: string[] = [];
  const socketBodies: string[] = [];
  let offline = false;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(url);
    if (offline) {
      throw new TypeError("fetch failed");
    }
    if (url.includes("api.socket.dev")) {
      socketBodies.push(String(init?.body ?? ""));
    }
    if (url.includes("api.github.com")) {
      const repo = url.split("/repos/")[1]!;
      return json({
        html_url: `https://github.com/${repo}`,
        open_issues_count: repo.split("/")[1]!.length,
      });
    }
    if (url.includes("api.socket.dev")) {
      return json([]);
    }
    const name = decodeURIComponent(url.split("/")[3]!);
    return json({
      version: "1.0.0",
      repository: { url: `git+https://github.com/acme/${name}.git` },
    });
  };
  const cache = new EnrichmentCache<unknown>({ now });
  const store = new EnrichmentStore({ cache, fetchImpl, now });
  const budget = options.budget ?? new GithubBudget({ now, minIntervalMs: 0 });
  let changes = 0;
  const policy = new SignalFetchPolicy({
    store,
    budget,
    now,
    socket: () =>
      typeof options.socket === "function"
        ? options.socket()
        : (options.socket ?? { status: "missing" }),
    githubToken: async () => options.githubToken?.(),
    onChange: () => {
      changes += 1;
    },
  });
  const github = () =>
    calls
      .filter((url) => url.includes("api.github.com/repos/"))
      .map((url) => url.split("/repos/")[1]!);
  return {
    policy,
    calls,
    npmCalls: () =>
      calls
        .filter((url) => url.includes("registry.npmjs.org"))
        .map((url) => decodeURIComponent(url.split("/")[3]!)),
    githubCalls: github,
    socketCalls: () => calls.filter((url) => url.includes("api.socket.dev")).length,
    socketBodies: () => socketBodies,
    budget,
    advance: (ms) => {
      clock += ms;
    },
    nowMs: now,
    setOffline: (value) => {
      offline = value;
    },
    changes: () => changes,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
