import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOverlay, type OverlayContext } from "./buildOverlay";

const DOC = "file:///work/app/package.json";

const ctx = (overrides: Partial<OverlayContext> = {}): OverlayContext => ({
  documentUri: DOC,
  enabled: true,
  trusted: true,
  readOnly: false,
  ...overrides,
});

const lensSummary = (text: string, context = ctx()) =>
  buildOverlay(text, context).lenses.map((lens) => ({
    line: lens.range.start.line,
    title: lens.title,
    command: lens.command,
    arguments: lens.arguments,
  }));

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
});
