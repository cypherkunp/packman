import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  description: string;
  categories: string[];
  engines: { vscode: string };
  contributes: {
    customEditors?: unknown;
    commands: Array<{ command: string; title: string }>;
    menus?: Record<string, Array<{ command: string; when?: string }>>;
    keybindings?: Array<{
      command: string;
      key: string;
      mac?: string;
      when: string;
    }>;
    configuration?: {
      properties?: Record<
        string,
        { type?: string; default?: unknown; markdownDescription?: string }
      >;
    };
  };
  capabilities?: {
    untrustedWorkspaces?: {
      supported?: boolean | string;
      description?: string;
    };
  };
  activationEvents?: string[];
};

describe("extension manifest", () => {
  it("contributes no custom editor, so package.json opens in the text editor", () => {
    assert.equal(manifest.contributes.customEditors, undefined);
    assert.ok(
      !manifest.activationEvents?.some((e) => e.startsWith("onCustomEditor:")),
    );
  });

  it("contributes no UI mode commands, menu entries or activation events", () => {
    const retired = ["packman.openUiMode", "packman.openEditMode"];
    const commands = manifest.contributes.commands.map((c) => c.command);
    const menuCommands = Object.values(manifest.contributes.menus ?? {})
      .flat()
      .map((m) => m.command);
    for (const command of retired) {
      assert.ok(!commands.includes(command), command);
      assert.ok(!menuCommands.includes(command), command);
      assert.ok(
        !manifest.activationEvents?.includes(`onCommand:${command}`),
        command,
      );
    }
    assert.ok(
      !manifest.contributes.commands.some((c) => /UI Mode|Text Editor/i.test(c.title)),
    );
  });

  it("binds no Cmd/Ctrl+Shift+M keybinding", () => {
    const bindings = manifest.contributes.keybindings ?? [];
    assert.ok(
      !bindings.some(
        (k) => k.key === "ctrl+shift+m" || k.mac === "cmd+shift+m",
      ),
    );
  });

  it("describes Packman as living inside the package.json text editor", () => {
    assert.match(manifest.description, /right inside your package\.json/);
  });

  it("lists categories that fit an editor Overlay, not Visualization", () => {
    assert.ok(!manifest.categories.includes("Visualization"));
    assert.ok(manifest.categories.length > 0);
  });

  it("targets a Cursor-compatible VS Code engine floor", () => {
    assert.match(manifest.engines.vscode, /^\^1\.(8[5-9]|9\d|\d{3,})\./);
  });

  it("contributes packman.github.token as an override that needs no setup", () => {
    const token =
      manifest.contributes.configuration?.properties?.["packman.github.token"];
    assert.equal(token?.type, "string");
    assert.equal(token?.default, "");
    assert.match(
      token?.markdownDescription ?? "",
      /No setup is needed when you're signed in to GitHub in the editor/,
    );
  });

  it("contributes the GitHub sign-in command the Block summary offers", () => {
    assert.ok(
      manifest.contributes.commands.some(
        (c) => c.command === "packman.signInToGithub",
      ),
    );
  });

  it("lists no redundant onCommand activation events", () => {
    assert.ok(
      !manifest.activationEvents?.some((e) => e.startsWith("onCommand:")),
    );
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

  it("describes the Overlay setting with the current fetch policy", () => {
    const description =
      manifest.contributes.configuration?.properties?.[
        "packman.overlay.enabled"
      ]?.markdownDescription ?? "";
    assert.match(description, /fetched when you open/);
    assert.doesNotMatch(description, /fetched on hover/);
  });

  it("mentions no retired term in user-facing manifest copy", () => {
    const copy = [
      manifest.description,
      manifest.capabilities?.untrustedWorkspaces?.description ?? "",
      ...manifest.contributes.commands.map((c) => c.title),
      ...Object.values(manifest.contributes.configuration?.properties ?? {}).map(
        (p) => p.markdownDescription ?? "",
      ),
    ];
    for (const text of copy) {
      assert.doesNotMatch(text, /UI mode|Edit mode|Script button/i, text);
    }
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
