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
  description: string;
  engines: { vscode: string };
  contributes: {
    customEditors: Array<{
      viewType: string;
      selector: Array<{ filenamePattern: string }>;
      priority: string;
    }>;
    commands: Array<{ command: string; title: string }>;
    menus: { "editor/title": Array<{ command: string; when: string }> };
    keybindings: Array<{
      command: string;
      key: string;
      mac?: string;
      when: string;
    }>;
    configuration?: {
      properties?: Record<string, { type?: string; default?: unknown }>;
    };
  };
  capabilities?: {
    untrustedWorkspaces?: { supported?: boolean | string };
  };
  activationEvents?: string[];
};

describe("extension manifest", () => {
  it("contributes Packman UI mode at option priority so package.json opens in the text editor", () => {
    const editor = manifest.contributes.customEditors[0];
    assert.equal(editor.viewType, PACKMAN_VIEW_TYPE);
    assert.equal(editor.priority, "option");
    assert.equal(editor.selector[0]?.filenamePattern, "**/package.json");
  });

  it("titles the UI mode → text editor command Open in Text Editor", () => {
    const command = manifest.contributes.commands.find(
      (c) => c.command === "packman.openEditMode",
    );
    assert.equal(command?.title, "Packman: Open in Text Editor");
    assert.ok(
      !manifest.contributes.commands.some((c) => /Edit Mode/i.test(c.title)),
    );
  });

  it("shows Open in Text Editor and Refresh in UI mode's title bar only", () => {
    const titleMenus = manifest.contributes.menus["editor/title"];
    const inUiMode = "activeCustomEditorId == packman.packageJson";
    for (const command of ["packman.openEditMode", "packman.refreshEnrichment"]) {
      const entries = titleMenus.filter((m) => m.command === command);
      assert.equal(entries.length, 1, command);
      assert.equal(entries[0]?.when, inUiMode, command);
    }
  });

  it("shows Open UI Mode in the text editor's title bar only", () => {
    const entries = manifest.contributes.menus["editor/title"].filter(
      (m) => m.command === "packman.openUiMode",
    );
    assert.equal(entries.length, 1);
    assert.equal(
      entries[0]?.when,
      "resourceFilename == package.json && activeCustomEditorId != packman.packageJson",
    );
  });

  it("binds Cmd/Ctrl+Shift+M to toggle between the text editor and UI mode", () => {
    const bindings = manifest.contributes.keybindings;
    const toText = bindings.find((k) => k.command === "packman.openEditMode");
    const toUi = bindings.find((k) => k.command === "packman.openUiMode");
    for (const binding of [toText, toUi]) {
      assert.equal(binding?.key, "ctrl+shift+m");
      assert.equal(binding?.mac, "cmd+shift+m");
    }
    assert.equal(toText?.when, "activeCustomEditorId == packman.packageJson");
    assert.equal(
      toUi?.when,
      "resourceFilename == package.json && activeCustomEditorId != packman.packageJson",
    );
  });

  it("describes Packman as living inside the package.json text editor", () => {
    assert.match(manifest.description, /right inside your package\.json/);
  });

  it("targets a Cursor-compatible VS Code engine floor", () => {
    assert.match(manifest.engines.vscode, /^\^1\.(8[5-9]|9\d|\d{3,})\./);
  });

  it("contributes optional packman.github.token setting", () => {
    const token =
      manifest.contributes.configuration?.properties?.["packman.github.token"];
    assert.equal(token?.type, "string");
  });

  it("contributes Socket end-user token settings", () => {
    const props = manifest.contributes.configuration?.properties ?? {};
    assert.equal(props["packman.socket.apiToken"]?.type, "string");
    assert.equal(props["packman.socket.orgSlug"]?.type, "string");
    assert.ok(
      manifest.contributes.commands.some(
        (c) => c.command === "packman.openSocketSettings",
      ),
    );
  });

  it("contributes the Overlay setting (default on) and toggle command", () => {
    const enabled =
      manifest.contributes.configuration?.properties?.[
        "packman.overlay.enabled"
      ];
    assert.equal(enabled?.type, "boolean");
    assert.equal(enabled?.default, true);
    assert.ok(
      manifest.contributes.commands.some(
        (c) => c.command === "packman.toggleOverlay",
      ),
    );
  });

  it("runs with limited support in untrusted workspaces so the trust lens can show", () => {
    assert.equal(
      manifest.capabilities?.untrustedWorkspaces?.supported,
      "limited",
    );
  });

  it("activates when a JSON document opens so the Overlay can attach", () => {
    assert.ok(manifest.activationEvents?.includes("onLanguage:json"));
  });
});
