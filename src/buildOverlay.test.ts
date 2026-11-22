import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOverlay,
  overlayDependencies,
  type DependencyEnrichment,
  type OverlayContext,
  type OverlayLens,
} from "./buildOverlay";

const DOC = "file:///work/app/package.json";

const ctx = (overrides: Partial<OverlayContext> = {}): OverlayContext => ({
  documentUri: DOC,
  enabled: true,
  trusted: true,
  readOnly: false,
  ...overrides,
});

const lensSummary = (text: string, context = ctx()) =>
  buildOverlay(text, context)
    .lenses.filter((lens) => !isBlockSummaryLens(lens))
    .map((lens) => ({
    line: lens.range.start.line,
    title: lens.title,
    command: lens.command,
    arguments: lens.arguments,
  }));

const isBlockSummaryLens = (lens: OverlayLens) =>
  lens.command === "" || lens.command === "packman.refreshEnrichment";

const SAMPLE = `{
  "name": "demo",
  "scripts": {
    "build": "tsc",
    "test": "node --test"
  },
  "dependencies": {
    "leftpad": "^1.0.0"
  }
}`;

describe("buildOverlay", () => {
  it("puts a ▶ Run lens on each scripts entry's line", () => {
    assert.deepEqual(lensSummary(SAMPLE), [
      {
        line: 3,
        title: "▶ Run",
        command: "packman.runScript",
        arguments: [DOC, "build"],
      },
      {
        line: 4,
        title: "▶ Run",
        command: "packman.runScript",
        arguments: [DOC, "test"],
      },
    ]);
  });

  it("replaces Run lenses with one trust lens above scripts when untrusted", () => {
    assert.deepEqual(lensSummary(SAMPLE, ctx({ trusted: false })), [
      {
        line: 2,
        title: "Trust workspace to run scripts",
        command: "workbench.trust.manage",
        arguments: [],
      },
    ]);
  });

  it("shows no script lenses in read-only or diff contexts", () => {
    assert.deepEqual(lensSummary(SAMPLE, ctx({ readOnly: true })), []);
    assert.deepEqual(
      lensSummary(SAMPLE, ctx({ readOnly: true, trusted: false })),
      [],
    );
  });

  it("returns an empty Overlay when disabled", () => {
    assert.deepEqual(buildOverlay(SAMPLE, ctx({ enabled: false })), {
      lenses: [],
      decorations: [],
      hovers: [],
    });
  });

  it("re-anchors Run lenses after scripts are inserted and reordered", () => {
    const edited = `{
  "name": "demo",
  "scripts": {
    "lint": "eslint .",
    "test": "node --test",

    "build": "tsc"
  }
}`;
    assert.deepEqual(
      lensSummary(edited).map(({ line, arguments: args }) => [line, args[1]]),
      [
        [3, "lint"],
        [4, "test"],
        [6, "build"],
      ],
    );
  });

  it("anchors on scripts written on one line, character-accurate", () => {
    const text = `{ "scripts": { "a": "x", "b": "y" } }`;
    const ranges = buildOverlay(text, ctx()).lenses.map((l) => l.range);
    assert.deepEqual(ranges, [
      { start: { line: 0, character: 15 }, end: { line: 0, character: 23 } },
      { start: { line: 0, character: 25 }, end: { line: 0, character: 33 } },
    ]);
  });

  it("gives no script lenses outside scripts, or for non-string scripts", () => {
    const text = `{
  "dependencies": { "build": "^1.0.0" },
  "overrides": { "test": "1.0.0" },
  "scripts": { "ok": "tsc", "weird": 42 }
}`;
    assert.deepEqual(
      lensSummary(text).map(({ line, arguments: args }) => [line, args[1]]),
      [[3, "ok"]],
    );
  });

  it("gives nothing without a scripts object, or with an empty one", () => {
    assert.deepEqual(lensSummary(`{ "name": "x" }`), []);
    assert.deepEqual(lensSummary(`{ "scripts": {} }`), []);
    assert.deepEqual(lensSummary(`{ "scripts": {} }`, ctx({ trusted: false })), []);
    assert.deepEqual(lensSummary(`[1, 2]`), []);
  });

  it("still anchors scripts while the JSON is mid-edit", () => {
    const broken = `{
  "scripts": {
    "build": "tsc",
    "test": "node --test",
  },
  "name": 
}`;
    assert.deepEqual(
      lensSummary(broken).map(({ line, arguments: args }) => [line, args[1]]),
      [
        [2, "build"],
        [3, "test"],
      ],
    );
  });

  describe("Dependency decorations", () => {
    const DEPS = `{
  "name": "demo",
  "version": "1.0.0",
  "dependencies": {
    "leftpad": "^1.0.0",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "~5.3.0"
  }
}`;

    const decorated = (
      text: string,
      enrichment: Record<string, DependencyEnrichment>,
      overrides: Partial<OverlayContext> = {},
    ) =>
      buildOverlay(
        text,
        ctx({ enrichment: new Map(Object.entries(enrichment)), ...overrides }),
      ).decorations.map((d) => ({
        line: d.range.start.line,
        text: d.text,
        tone: d.tone,
      }));

    it("shows → latest on an outdated Dependency", () => {
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latest: "2.1.0" },
          react: { latest: "19.0.0" },
          typescript: { latest: "5.6.2" },
        }),
        [
          { line: 4, text: "→ 2.1.0", tone: "outdated" },
          { line: 5, text: "→ 19.0.0", tone: "outdated" },
          { line: 8, text: "→ 5.6.2", tone: "outdated" },
        ],
      );
    });

    it("shows a quiet latest marker when the range already allows latest", () => {
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latest: "1.3.0" },
          react: { latest: "18.3.1" },
          typescript: { latest: "5.3.3" },
        }).map((d) => [d.line, d.text, d.tone]),
        [
          [4, "✓ latest", "latest"],
          [5, "✓ latest", "latest"],
          [8, "✓ latest", "latest"],
        ],
      );
    });

    it("shows a pending marker while a Dependency's enrichment is loading", () => {
      assert.deepEqual(
        decorated(DEPS, { react: { latest: "18.3.1" } }).map((d) => [
          d.line,
          d.text,
          d.tone,
        ]),
        [
          [4, "…", "pending"],
          [5, "✓ latest", "latest"],
          [8, "…", "pending"],
        ],
      );
    });

    it("shows a degraded marker when the registry lookup failed", () => {
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latestDegrade: "offline" },
          react: { latestDegrade: "rate_limited" },
          typescript: { latestDegrade: "timeout" },
        }).map((d) => [d.line, d.text, d.tone]),
        [
          [4, "⚠ npm offline", "degraded"],
          [5, "⚠ npm rate-limited", "degraded"],
          [8, "⚠ npm timed out", "degraded"],
        ],
      );
    });

    it("keeps the version signal when a degraded lookup still has a cached latest", () => {
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latest: "2.0.0", latestDegrade: "rate_limited" },
          react: { latest: "18.3.1" },
          typescript: { latest: "5.3.3" },
        }).map((d) => [d.line, d.text]),
        [
          [4, "→ 2.0.0"],
          [5, "✓ latest"],
          [8, "✓ latest"],
        ],
      );
    });

    it("adds the Socket score when Socket is configured, flagging risk", () => {
      const score = (overall100: number, highSeverity = false) => ({
        kind: "score" as const,
        overall100,
        highSeverity,
        url: "https://socket.dev/npm/package/x",
      });
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latest: "2.1.0", socket: score(87) },
          react: { latest: "18.3.1", socket: score(42, true) },
          typescript: { latest: "5.3.3", socket: { kind: "empty" } },
        }),
        [
          { line: 4, text: "→ 2.1.0 · Socket 87", tone: "outdated" },
          { line: 5, text: "✓ latest · Socket 42", tone: "risk" },
          { line: 8, text: "✓ latest", tone: "latest" },
        ],
      );
    });

    it("never nags on the line when Socket isn't configured", () => {
      assert.deepEqual(
        decorated(DEPS, {
          leftpad: { latest: "1.0.0", socket: { kind: "cta" } },
          react: { latest: "18.3.1", socket: { kind: "cta" } },
          typescript: { latest: "5.3.3", socket: { kind: "cta" } },
        }).map((d) => d.text),
        ["✓ latest", "✓ latest", "✓ latest"],
      );
    });

    it("decorates only Dependencies, never Override entries or other fields", () => {
      const text = `{
  "name": "leftpad",
  "version": "1.0.0",
  "engines": { "node": ">=18" },
  "scripts": { "leftpad": "echo" },
  "overrides": { "leftpad": "1.0.0" },
  "resolutions": { "leftpad": "1.0.0" },
  "peerDependencies": { "leftpad": "^1.0.0" },
  "optionalDependencies": { "fsevents": "^2.0.0" },
  "config": { "dependencies": { "leftpad": "^1.0.0" } }
}`;
      assert.deepEqual(
        decorated(text, {
          leftpad: { latest: "1.0.0" },
          node: { latest: "22.0.0" },
        }).map((d) => [d.line, d.text]),
        [
          [7, "✓ latest"],
          [8, "…"],
        ],
      );
    });

    it("gives non-registry Dependencies no version note, even while loading", () => {
      const text = `{
  "dependencies": {
    "@acme/ui": "workspace:*",
    "local": "file:../local",
    "fork": "github:me/fork"
  }
}`;
      assert.deepEqual(decorated(text, {}), []);
      assert.deepEqual(
        decorated(text, { "@acme/ui": { latest: "9.9.9" } }),
        [],
      );
    });

    const KNOWN = {
      leftpad: { latest: "2.1.0" },
      react: { latest: "18.3.1" },
      typescript: { latest: "5.3.3" },
    };

    it("follows Dependencies when entries are inserted, removed or reordered", () => {
      const edited = `{
  "dependencies": {
    "react": "^18.2.0",

    "zod": "^3.0.0",
    "leftpad": "^1.0.0"
  }
}`;
      assert.deepEqual(
        decorated(edited, KNOWN).map((d) => [d.line, d.text]),
        [
          [2, "✓ latest"],
          [4, "…"],
          [5, "→ 2.1.0"],
        ],
      );
    });

    it("re-reads the range from the text, so a changed range needs no new enrichment", () => {
      const bumped = DEPS.replace('"leftpad": "^1.0.0"', '"leftpad": "^2.0.0"');
      assert.deepEqual(
        decorated(bumped, KNOWN).map((d) => [d.line, d.text]),
        [
          [4, "✓ latest"],
          [5, "✓ latest"],
          [8, "✓ latest"],
        ],
      );
    });

    it("anchors each Dependency on a one-line block, character-accurate", () => {
      const text = `{ "dependencies": { "react": "^18.2.0", "leftpad": "^1.0.0" } }`;
      const ranges = buildOverlay(
        text,
        ctx({ enrichment: new Map(Object.entries(KNOWN)) }),
      ).decorations.map((d) => d.range);
      assert.deepEqual(ranges, [
        { start: { line: 0, character: 20 }, end: { line: 0, character: 38 } },
        { start: { line: 0, character: 40 }, end: { line: 0, character: 59 } },
      ]);
    });

    it("keeps decorations while the JSON is mid-edit", () => {
      const broken = `{
  "dependencies": {
    "react": "^18.2.0",
    "leftpad": "^1.0.0",
  },
  "name":
}`;
      assert.deepEqual(
        decorated(broken, KNOWN).map((d) => [d.line, d.text]),
        [
          [2, "✓ latest"],
          [3, "→ 2.1.0"],
        ],
      );
    });

    it("still decorates read-only and diff views; the disabled Overlay shows none", () => {
      assert.equal(decorated(DEPS, KNOWN, { readOnly: true }).length, 3);
      assert.equal(
        decorated(DEPS, KNOWN, { readOnly: true, trusted: false }).length,
        3,
      );
      assert.deepEqual(decorated(DEPS, KNOWN, { enabled: false }), []);
    });

    it("lists the registry Dependencies the adapter should enrich", () => {
      const text = `{
  "name": "demo",
  "dependencies": { "react": "^18.2.0", "@acme/ui": "workspace:*" },
  "devDependencies": { "typescript": "~5.3.0" },
  "overrides": { "leftpad": "1.0.0" }
}`;
      assert.deepEqual(overlayDependencies(text), [
        { name: "react", range: "^18.2.0" },
        { name: "typescript", range: "~5.3.0" },
      ]);
      assert.deepEqual(overlayDependencies("[]"), []);
    });
  });

  describe("block summary lenses", () => {
    const BLOCKS = `{
  "name": "demo",
  "dependencies": {
    "leftpad": "^1.0.0",
    "react": "^18.2.0",
    "@acme/ui": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.3.0"
  },
  "peerDependencies": {}
}`;

    const summaries = (
      text: string,
      enrichment: Record<string, DependencyEnrichment> = {},
      overrides: Partial<OverlayContext> = {},
    ) =>
      buildOverlay(
        text,
        ctx({ enrichment: new Map(Object.entries(enrichment)), ...overrides }),
      )
        .lenses.filter(isBlockSummaryLens)
        .map((lens) => ({
          line: lens.range.start.line,
          title: lens.title,
          command: lens.command,
          arguments: lens.arguments,
        }));

    it("puts counts and ↻ Refresh above each non-empty dependency block", () => {
      assert.deepEqual(
        summaries(BLOCKS, {
          leftpad: { latest: "2.1.0" },
          react: { latest: "18.3.1" },
          typescript: { latest: "5.6.2" },
        }),
        [
          {
            line: 2,
            title: "3 deps · 1 outdated",
            command: "",
            arguments: [],
          },
          {
            line: 2,
            title: "↻ Refresh",
            command: "packman.refreshEnrichment",
            arguments: [],
          },
          {
            line: 7,
            title: "1 dep · 1 outdated",
            command: "",
            arguments: [],
          },
          {
            line: 7,
            title: "↻ Refresh",
            command: "packman.refreshEnrichment",
            arguments: [],
          },
        ],
      );
    });

    const socket = (overall100: number, highSeverity: boolean) => ({
      kind: "score" as const,
      overall100,
      highSeverity,
      url: "https://socket.dev",
    });

    const titles = (
      enrichment: Record<string, DependencyEnrichment>,
      overrides: Partial<OverlayContext> = {},
    ) =>
      summaries(BLOCKS, enrichment, overrides)
        .filter((lens) => lens.command === "")
        .map((lens) => lens.title);

    it("counts Socket alerts only when Socket is configured", () => {
      const enrichment = {
        leftpad: { latest: "1.3.0", socket: socket(40, true) },
        react: { latest: "18.3.1", socket: socket(90, false) },
        typescript: { latest: "5.3.3", socket: socket(30, true) },
      };
      assert.deepEqual(titles(enrichment), [
        "3 deps · 0 outdated",
        "1 dep · 0 outdated",
      ]);
      assert.deepEqual(titles(enrichment, { socketConfigured: true }), [
        "3 deps · 0 outdated · 1 Socket alert",
        "1 dep · 0 outdated · 1 Socket alert",
      ]);
      assert.deepEqual(
        titles(
          {
            ...enrichment,
            react: { latest: "18.3.1", socket: socket(10, true) },
          },
          { socketConfigured: true },
        ),
        [
          "3 deps · 0 outdated · 2 Socket alerts",
          "1 dep · 0 outdated · 1 Socket alert",
        ],
      );
      assert.deepEqual(titles({}, { socketConfigured: true }), [
        "3 deps · 0 outdated · 0 Socket alerts",
        "1 dep · 0 outdated · 0 Socket alerts",
      ]);
    });

    it("adds GitHub paused while the GitHub budget is blocked", () => {
      const enrichment = {
        leftpad: { latest: "2.1.0", socket: socket(40, true) },
      };
      assert.deepEqual(titles(enrichment, { githubPaused: true }), [
        "3 deps · 1 outdated · GitHub paused",
        "1 dep · 0 outdated · GitHub paused",
      ]);
      assert.deepEqual(
        titles(enrichment, { githubPaused: true, socketConfigured: true }),
        [
          "3 deps · 1 outdated · 1 Socket alert · GitHub paused",
          "1 dep · 0 outdated · 0 Socket alerts · GitHub paused",
        ],
      );
      assert.deepEqual(titles(enrichment, { githubPaused: false }), [
        "3 deps · 1 outdated",
        "1 dep · 0 outdated",
      ]);
    });

    it("summarises read-only views, but not a disabled Overlay or empty blocks", () => {
      assert.equal(
        summaries(BLOCKS, {}, { readOnly: true, trusted: false }).length,
        4,
      );
      assert.deepEqual(summaries(BLOCKS, {}, { enabled: false }), []);
      const noDeps = SAMPLE.replace(/"dependencies"[^}]*}/, '"dependencies": {}');
      assert.deepEqual(summaries(noDeps), []);
    });
  });

  describe("while the JSON is broken mid-edit", () => {
    const LAST_GOOD = `{
  "scripts": {
    "build": "tsc",
    "test": "node --test"
  },
  "dependencies": {
    "react": "^18.2.0",
    "leftpad": "^1.0.0",
    "typescript": "~5.3.0"
  }
}`;
    const KNOWN: Record<string, DependencyEnrichment> = {
      react: { latest: "18.2.0" },
      leftpad: { latest: "2.1.0" },
      typescript: { latest: "5.3.0" },
    };

    const view = (text: string, lastGoodText: string | undefined = LAST_GOOD) => {
      const overlay = buildOverlay(
        text,
        ctx({ enrichment: new Map(Object.entries(KNOWN)), lastGoodText }),
      );
      return {
        lenses: overlay.lenses.map((lens) => [
          lens.range.start.line,
          lens.title,
        ]),
        decorations: overlay.decorations.map((d) => [
          d.range.start.line,
          d.text,
        ]),
      };
    };

    it("keeps the other Dependencies decorated while one name is an unclosed string", () => {
      const broken = LAST_GOOD.replace('"leftpad": "^1.0.0",', '"lef');
      assert.deepEqual(view(broken).decorations, [
        [6, "✓ latest"],
        [8, "✓ latest"],
      ]);
    });

    it("keeps the other Dependencies' hovers on their lines", () => {
      const broken = LAST_GOOD.replace('"leftpad": "^1.0.0",', '"lef');
      assert.deepEqual(
        buildOverlay(broken, ctx({ lastGoodText: LAST_GOOD })).hovers.map(
          (hover) => hover.range.start.line,
        ),
        [6, 8],
      );
    });

    it("drops an entry whose value is broken, rather than misplacing it", () => {
      const broken = LAST_GOOD.replace('"^1.0.0",', '"^1.0.0');
      assert.deepEqual(view(broken).decorations, [
        [6, "✓ latest"],
        [8, "✓ latest"],
      ]);
    });

    it("keeps only entries from the last good text, so half-typed ones stay bare", () => {
      const broken = LAST_GOOD.replace(
        '"typescript": "~5.3.0"',
        '"typescript": "~5.3.0"\n    "lodash": "^4.0.0"',
      );
      assert.deepEqual(view(broken).decorations, [
        [6, "✓ latest"],
        [7, "→ 2.1.0"],
        [8, "✓ latest"],
      ]);
    });

    it("keeps the other scripts' Run lenses and re-counts the block summary", () => {
      const broken = LAST_GOOD.replace('"tsc",', '"tsc,').replace(
        '"react": "^18.2.0",',
        '"react": "^18.2.0"',
      );
      assert.deepEqual(view(broken).lenses, [
        [3, "▶ Run"],
        [5, "3 deps · 1 outdated"],
        [5, "↻ Refresh"],
      ]);
    });

    it("drops entries after a block that lost its closing brace", () => {
      const broken = LAST_GOOD.replace("  },\n  \"dependencies\"", '  \n  "dependencies"');
      assert.deepEqual(view(broken), {
        lenses: [
          [2, "▶ Run"],
          [3, "▶ Run"],
        ],
        decorations: [],
      });
    });

    it("asks for no enrichment while broken, so half-typed names aren't fetched", () => {
      const broken = LAST_GOOD.replace(
        '"typescript": "~5.3.0"',
        '"typescript": "~5.3.0"\n    "lod": "^4"',
      );
      assert.deepEqual(overlayDependencies(broken), []);
      assert.equal(overlayDependencies(LAST_GOOD).length, 3);
    });

    it("re-renders normally once the JSON is valid again", () => {
      const fixed = LAST_GOOD.replace(
        '"typescript": "~5.3.0"',
        '"typescript": "~5.3.0",\n    "lodash": "^4.0.0"',
      );
      assert.deepEqual(view(fixed).decorations, [
        [6, "✓ latest"],
        [7, "→ 2.1.0"],
        [8, "✓ latest"],
        [9, "…"],
      ]);
    });
  });
});
