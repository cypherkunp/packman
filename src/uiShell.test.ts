import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiShellHtml } from "./uiShell";

describe("buildUiShellHtml", () => {
  it("uses VS Code theme CSS variables for native look", () => {
    const html = buildUiShellHtml();
    assert.match(html, /var\(--vscode-editor-background\)/);
    assert.match(html, /var\(--vscode-foreground\)/);
    assert.match(html, /var\(--vscode-font-family\)/);
  });

  it("renders an empty placeholder (no package data yet)", () => {
    const html = buildUiShellHtml();
    assert.match(html, /Packman/i);
    assert.doesNotMatch(html, /dependencies/i);
    assert.doesNotMatch(html, /"scripts"/);
  });

  it("applies a CSP nonce to the theme stylesheet", () => {
    const html = buildUiShellHtml("test-nonce");
    assert.match(html, /nonce="test-nonce"/);
    assert.match(html, /style-src 'nonce-test-nonce'/);
  });
});
