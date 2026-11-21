import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderUiModeBody, renderUiModeHtml } from "./renderUiModeHtml";

describe("renderUiModeHtml", () => {
  it("renders identity, Script buttons, Dependency rows, and Override entries", () => {
    const html = renderUiModeHtml(
      JSON.stringify({
        name: "demo",
        version: "1.0.0",
        scripts: { build: "tsc" },
        dependencies: { leftpad: "^1.0.0" },
        overrides: { foo: "2.0.0" },
      }),
      "n",
    );
    assert.match(html, /<h1>demo<span class="version">@1\.0\.0<\/span><\/h1>/);
    assert.match(html, /data-script="build"/);
    assert.doesNotMatch(html, /\sdisabled(\s|>)/);
    assert.match(html, /acquireVsCodeApi/);
    assert.match(html, /type:\s*"runScript"/);
    assert.match(html, />leftpad</);
    assert.match(html, />\^1\.0\.0</);
    assert.match(html, />foo</);
    assert.match(html, />2\.0\.0</);
    assert.match(html, /var\(--vscode-editor-background\)/);
  });

  it("renders generic keys and omits empty bags", () => {
    const html = renderUiModeHtml(
      JSON.stringify({
        name: "demo",
        eslintConfig: { root: true },
        devDependencies: {},
      }),
      "n",
    );
    assert.match(html, /eslintConfig/);
    assert.doesNotMatch(html, /Dev dependencies/);
  });

  it("renders objects and arrays inside read-only formatted code blocks", () => {
    const html = renderUiModeHtml(
      JSON.stringify({
        name: "demo",
        engines: { node: ">=20", count: 1, ok: true, extra: null },
        keywords: ["a", "b"],
        note: { raw: "<img onerror=alert(1)>" },
      }),
      "n",
    );
    assert.match(html, /<pre class="code-block"><code>/);
    assert.match(html, /class="tok-key">/);
    assert.match(html, /&quot;node&quot;/);
    assert.match(html, /class="tok-string">/);
    assert.match(html, /&quot;&gt;=20&quot;/);
    assert.match(html, /class="tok-number">1</);
    assert.match(html, /class="tok-boolean">true</);
    assert.match(html, /class="tok-null">null</);
    assert.match(html, /\[[\s\S]*&quot;a&quot;[\s\S]*&quot;b&quot;[\s\S]*\]/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
    assert.match(html, /pre\.code-block[\s\S]*word-break:\s*normal/);
    assert.doesNotMatch(html, /contenteditable/);
  });

  it("renders enrichment columns and click targets when provided", () => {
    const enrichment = new Map([
      [
        "leftpad",
        {
          name: "leftpad",
          range: "^1.0.0",
          npmUrl: "https://www.npmjs.com/package/leftpad",
          latest: "1.3.0",
          githubUrl: "https://github.com/stevemao/left-pad",
          issuesUrl: "https://github.com/stevemao/left-pad/issues",
          openIssuesCount: 7,
          socket: {
            kind: "score" as const,
            overall100: 91,
            highSeverity: true,
            url: "https://socket.dev/npm/package/leftpad",
          },
        },
      ],
    ]);
    const html = renderUiModeHtml(
      JSON.stringify({
        name: "demo",
        dependencies: { leftpad: "^1.0.0" },
      }),
      "n",
      enrichment,
    );
    assert.match(html, /npmjs\.com\/package\/leftpad/);
    assert.match(html, />1\.3\.0</);
    assert.match(html, /github\.com\/stevemao\/left-pad/);
    assert.match(html, /Issues \+ PRs/);
    assert.match(html, />7</);
    assert.match(html, />91<span class="of">\/100</);
    assert.match(html, /aria-label="leftpad repository on GitHub"/);
    assert.match(html, /socket\.dev\/npm\/package\/leftpad/);
    assert.match(html, /socket-high/);
  });

  it("shows Set Socket token CTA when Socket credentials are missing", () => {
    const enrichment = new Map([
      [
        "leftpad",
        {
          name: "leftpad",
          range: "^1.0.0",
          npmUrl: "https://www.npmjs.com/package/leftpad",
          socket: { kind: "cta" as const },
        },
      ],
    ]);
    const html = renderUiModeHtml(
      JSON.stringify({ dependencies: { leftpad: "^1.0.0" } }),
      "n",
      enrichment,
    );
    assert.equal(html.match(/Set Socket token/g)?.length, 1);
    assert.doesNotMatch(html, />Set token</);
    assert.match(html, /Socket risk scores are off/);
    assert.match(html, /command:packman\.openSocketSettings/);
    assert.doesNotMatch(html, /<th scope="col"[^>]*>Socket</);
  });

  it("keeps repo links and shows one GitHub rate-limit notice", () => {
    const row = {
      name: "leftpad",
      range: "^1.0.0",
      npmUrl: "https://www.npmjs.com/package/leftpad",
      githubUrl: "https://github.com/stevemao/left-pad",
      issuesUrl: "https://github.com/stevemao/left-pad/issues",
      issuesDegrade: "rate_limited" as const,
    };
    const html = renderUiModeHtml(
      JSON.stringify({
        name: "demo",
        dependencies: { leftpad: "^1.0.0", other: "^2.0.0" },
      }),
      "n",
      new Map([
        ["leftpad", row],
        ["other", { ...row, name: "other" }],
      ]),
      { githubResetLabel: "18:42" },
    );
    assert.equal(html.match(/GitHub rate limit reached/g)?.length, 1);
    assert.match(html, /are paused until 18:42/);
    assert.match(html, /command:packman\.openGithubSettings/);
    assert.match(html, /href="https:\/\/github\.com\/stevemao\/left-pad"/);
    assert.doesNotMatch(html, /\(rate limited\)/);
  });

  it("shows a recoverable parse error with an Edit mode action at the position", () => {
    const html = renderUiModeHtml('{\n  "name": "x",\n}', "n", new Map(), {
      editShortcut: "⌘⇧M",
    });
    assert.match(html, /isn’t valid JSON/);
    assert.match(html, /data-action="edit" data-key="action-edit" data-line="3" data-column="1"/);
    assert.match(html, /Open in Edit mode at line 3, column 1/);
    assert.doesNotMatch(html, /in JSON at position/);
  });

  it("explains a non-object root", () => {
    const html = renderUiModeBody("[]");
    assert.match(html, /isn’t a package manifest/);
  });

  it("labels ranges that latest has outgrown and counts rows needing attention", () => {
    const html = renderUiModeBody(
      JSON.stringify({
        dependencies: { react: "^18.2.0", tsx: "^4.0.0", local: "workspace:*" },
      }),
      new Map([
        ["react", { name: "react", range: "^18.2.0", npmUrl: "u", latest: "19.2.0" }],
        ["tsx", { name: "tsx", range: "^4.0.0", npmUrl: "u", latest: "4.20.6" }],
        ["local", { name: "local", range: "workspace:*", npmUrl: "u", latestDegrade: "timeout" as const }],
      ]),
    );
    assert.match(html, /19\.2\.0<span class="gap breaking"[^>]*>major</);
    assert.match(html, /4\.20\.6<\/td>/);
    assert.match(html, /1 needs attention/);
    assert.match(html, /Resolved from workspace/);
    assert.doesNotMatch(html, /timed out/);
  });

  it("marks cells as loading while enrichment is in flight", () => {
    const html = renderUiModeBody(
      JSON.stringify({ name: "demo", dependencies: { a: "^1.0.0" } }),
      new Map(),
      { loading: true },
    );
    assert.match(html, /role="status"[^>]*>Fetching registry/);
    assert.match(html, /<span class="sr-only">loading<\/span>/);
    assert.doesNotMatch(html, /need attention|All within range/);
  });

  it("shows Edit mode and Refresh controls with the keybinding", () => {
    const html = renderUiModeBody(
      JSON.stringify({ name: "demo", dependencies: { a: "^1.0.0" } }),
      new Map(),
      { editShortcut: "Ctrl+Shift+M" },
    );
    assert.match(html, /data-action="edit"[^>]*>Edit mode <kbd>Ctrl\+Shift\+M<\/kbd>/);
    assert.match(html, /data-action="refresh"/);
  });

  it("collapses structured generic fields and shows an empty state", () => {
    const html = renderUiModeBody(
      JSON.stringify({ name: "demo", contributes: { a: 1, b: 2 }, private: true }),
    );
    assert.match(html, /<details class="field"[^>]*><summary[^>]*><span class="key">contributes<\/span><span class="shape">2 keys<\/span>/);
    assert.match(html, /No scripts or dependencies yet/);
  });

  it("patches the page in place instead of reloading", () => {
    const html = renderUiModeHtml(JSON.stringify({ name: "demo" }), "n");
    assert.match(html, /message\.type !== "render"/);
    assert.match(html, /type: "ready"/);
  });
});
