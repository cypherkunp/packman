import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PACKMAN_VIEW_TYPE } from "./openWith";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  engines: { vscode: string };
  contributes: {
    customEditors: Array<{
      viewType: string;
      selector: Array<{ filenamePattern: string }>;
      priority: string;
    }>;
    commands: Array<{ command: string }>;
    menus: { "editor/title": Array<{ command: string; when: string }> };
    keybindings: Array<{ command: string; when: string }>;
    configuration?: {
      properties?: Record<string, { type?: string }>;
    };
  };
};

describe("extension manifest", () => {
  it("registers Packman as the default custom text editor for **/package.json", () => {
    const editor = manifest.contributes.customEditors[0];
    assert.equal(editor.viewType, PACKMAN_VIEW_TYPE);
    assert.equal(editor.priority, "default");
    assert.equal(editor.selector[0]?.filenamePattern, "**/package.json");
  });

  it("exposes Edit / UI mode commands with title-bar and keybinding wiring", () => {
    const commands = new Set(
      manifest.contributes.commands.map((c) => c.command),
    );
    assert.ok(commands.has("packman.openEditMode"));
    assert.ok(commands.has("packman.openUiMode"));

    const titleMenus = manifest.contributes.menus["editor/title"];
    assert.ok(
      titleMenus.some(
        (m) =>
          m.command === "packman.openEditMode" &&
          m.when.includes("activeCustomEditorId == packman.packageJson"),
      ),
    );
    assert.ok(
      titleMenus.some(
        (m) =>
          m.command === "packman.openUiMode" &&
          m.when.includes("resourceFilename == package.json"),
      ),
    );

    assert.ok(
      manifest.contributes.keybindings.some(
        (k) => k.command === "packman.openEditMode",
      ),
    );
    assert.ok(
      manifest.contributes.keybindings.some(
        (k) => k.command === "packman.openUiMode",
      ),
    );
  });

  it("targets a Cursor-compatible VS Code engine floor", () => {
    assert.match(manifest.engines.vscode, /^\^1\.(8[5-9]|9\d|\d{3,})\./);
  });

  it("contributes optional packman.github.token setting", () => {
    const token =
      manifest.contributes.configuration?.properties?.["packman.github.token"];
    assert.equal(token?.type, "string");
  });
});
