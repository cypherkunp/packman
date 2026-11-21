import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOverlay,
  type DependencyEnrichment,
  type DependencyGithub,
  type OverlayContext,
} from "./buildOverlay";

const DEPS = `{
  "name": "demo",
  "dependencies": {
    "leftpad": "^1.0.0"
  },
  "overrides": {
    "react": "18.3.1"
  }
}`;

const SCORE = {
  kind: "score" as const,
  overall100: 87,
  highSeverity: false,
  url: "https://socket.dev/npm/package/leftpad",
};

const GITHUB: DependencyGithub = {
  githubUrl: "https://github.com/acme/leftpad",
  issuesUrl: "https://github.com/acme/leftpad/issues",
  openIssuesCount: 12,
};

const hovers = (
  context: Partial<OverlayContext> & {
    eager?: Record<string, DependencyEnrichment>;
    github?: Record<string, DependencyGithub>;
  } = {},
  text = DEPS,
) => {
  const { eager, github, ...rest } = context;
  return buildOverlay(text, {
    documentUri: "file:///work/app/package.json",
    enabled: true,
    trusted: true,
    readOnly: false,
    enrichment: new Map(Object.entries(eager ?? {})),
    github: new Map(Object.entries(github ?? {})),
    ...rest,
  }).hovers;
};

const hoverFor = (context: Parameters<typeof hovers>[0]) => {
  const all = hovers(context);
  assert.equal(all.length, 1);
  return all[0]!;
};

describe("buildOverlay Dependency hovers", () => {
  it("shows latest, npm, GitHub, issues + PRs and Socket for an enriched Dependency", () => {
    const hover = hoverFor({
      eager: { leftpad: { latest: "2.1.0", socket: SCORE } },
      github: { leftpad: GITHUB },
    });
    assert.equal(hover.dependency, "leftpad");
    assert.deepEqual(hover.range, {
      start: { line: 3, character: 4 },
      end: { line: 3, character: 23 },
    });
    assert.equal(
      hover.markdown,
      [
        "**leftpad** · latest `2.1.0`",
        "[npm](https://www.npmjs.com/package/leftpad) · [GitHub](https://github.com/acme/leftpad) · [12 open issues + PRs](https://github.com/acme/leftpad/issues)",
        "_GitHub counts open issues and pull requests together._",
        "Socket score **87**/100 · [details](https://socket.dev/npm/package/leftpad)",
      ].join("\n\n"),
    );
  });

  it("offers Configure Socket… as a command link when Socket isn't configured", () => {
    const hover = hoverFor({
      eager: { leftpad: { latest: "2.1.0", socket: { kind: "cta" } } },
      github: { leftpad: GITHUB },
    });
    assert.equal(
      hover.markdown.split("\n\n").at(-1),
      "[Configure Socket…](command:packman.openSocketSettings) to see supply-chain scores.",
    );
  });

  it("says when GitHub is paused and links to add a token while rate-limited", () => {
    const hover = hoverFor({
      eager: { leftpad: { latest: "2.1.0", socket: SCORE } },
      github: {
        leftpad: {
          githubUrl: "https://github.com/acme/leftpad",
          githubDegrade: "rate_limited",
        },
      },
      githubPausedUntil: "14:05",
    });
    assert.deepEqual(hover.markdown.split("\n\n").slice(1), [
      "[npm](https://www.npmjs.com/package/leftpad) · [GitHub](https://github.com/acme/leftpad)",
      "Socket score **87**/100 · [details](https://socket.dev/npm/package/leftpad)",
      "GitHub paused until 14:05 · [add a token…](command:packman.openGithubSettings)",
    ]);
  });

  it("notes failed npm and GitHub lookups with a Refresh command link", () => {
    const hover = hoverFor({
      eager: { leftpad: { latestDegrade: "offline", socket: SCORE } },
      github: {
        leftpad: {
          githubUrl: "https://github.com/acme/leftpad",
          issuesDegrade: "timeout",
        },
      },
    });
    assert.deepEqual(hover.markdown.split("\n\n"), [
      "**leftpad**",
      "[npm](https://www.npmjs.com/package/leftpad) · [GitHub](https://github.com/acme/leftpad)",
      "Socket score **87**/100 · [details](https://socket.dev/npm/package/leftpad)",
      "⚠ npm lookup offline · ⚠ GitHub issues + PRs timed out · [Refresh](command:packman.refreshEnrichment)",
    ]);
  });

  it("shows a loading note while GitHub data hasn't arrived", () => {
    const hover = hoverFor({
      eager: { leftpad: { latest: "2.1.0", socket: SCORE } },
    });
    assert.deepEqual(hover.markdown.split("\n\n").slice(1), [
      "[npm](https://www.npmjs.com/package/leftpad)",
      "_GitHub repo and open issues + PRs loading…_",
      "Socket score **87**/100 · [details](https://socket.dev/npm/package/leftpad)",
    ]);
  });

  it("hovers only Dependencies, never Override entries, scripts or other fields", () => {
    const text = `{
  "name": "demo",
  "scripts": { "build": "tsc" },
  "dependencies": { "leftpad": "^1.0.0", "local": "file:../local" },
  "devDependencies": { "typescript": "~5.3.0" },
  "overrides": { "react": "18.3.1" },
  "resolutions": { "lodash": "4.17.21" }
}`;
    assert.deepEqual(
      hovers({}, text).map((hover) => hover.dependency),
      ["leftpad", "typescript"],
    );
  });

  it("gives no hovers when the Overlay is disabled", () => {
    assert.deepEqual(hovers({ enabled: false }), []);
  });
});
