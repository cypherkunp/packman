import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderUiModeHtml } from "./renderUiModeHtml";

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
    assert.match(html, />demo</);
    assert.match(html, />1\.0\.0</);
    assert.match(html, /data-script="build"/);
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
    assert.doesNotMatch(html, /devDependencies/);
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
    assert.match(html, /issues \+ PRs/);
    assert.match(html, />7</);
  });

  it("shows a parse error shell for invalid JSON", () => {
    const html = renderUiModeHtml("{", "n");
    assert.match(html, /Invalid JSON/i);
  });
});
