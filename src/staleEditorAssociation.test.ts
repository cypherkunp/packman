import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  promptStaleEditorAssociation,
  type StaleAssociationHost,
} from "./staleEditorAssociation";

type AssociationScope = "global" | "workspace" | "folder-a" | "folder-b";

type Harness = {
  host: StaleAssociationHost<AssociationScope>;
  scopes: Map<AssociationScope, Record<string, string> | undefined>;
  prompts: string[];
  flags: Map<string, boolean>;
};

function harness(
  initial: Partial<Record<AssociationScope, Record<string, string>>>,
  answer: "Remove association" | undefined | "never",
  flags = new Map<string, boolean>(),
): Harness {
  const scopes = new Map<AssociationScope, Record<string, string> | undefined>(
    Object.entries(initial) as Array<[AssociationScope, Record<string, string>]>,
  );
  const prompts: string[] = [];
  const host: StaleAssociationHost<AssociationScope> = {
    scopes: () => ["global", "workspace", "folder-a", "folder-b"],
    readAssociations: (scope) => scopes.get(scope),
    writeAssociations: async (scope, value) => {
      scopes.set(scope, value);
    },
    showPrompt: async (message, action) => {
      prompts.push(message);
      assert.equal(action, "Remove association");
      return answer === "never" ? new Promise<string | undefined>(() => {}) : answer;
    },
    wasDismissed: () => flags.get("dismissed") === true,
    markDismissed: async () => {
      flags.set("dismissed", true);
    },
  };
  return { host, scopes, prompts, flags };
}

describe("promptStaleEditorAssociation", () => {
  it("does nothing when no association points at the retired Packman editor", async () => {
    const h = harness({ global: { "*.md": "vscode.markdown.preview.editor" } }, undefined);
    await promptStaleEditorAssociation(h.host);
    assert.deepEqual(h.prompts, []);
    assert.deepEqual(h.scopes.get("global"), {
      "*.md": "vscode.markdown.preview.editor",
    });
  });

  it("ignores Packman entries whose pattern does not target package.json", async () => {
    const other = { "*.json": "packman.packageJson", "tsconfig.json": "packman.packageJson" };
    const h = harness({ global: other }, "Remove association");
    await promptStaleEditorAssociation(h.host);
    assert.deepEqual(h.prompts, []);
    assert.deepEqual(h.scopes.get("global"), other);
  });

  it("removes only package.json entries pointing at the retired editor", async () => {
    const h = harness(
      {
        global: {
          "**/package.json": "packman.packageJson",
          "*.json": "packman.packageJson",
          "package.json.bak": "packman.packageJson",
        },
      },
      "Remove association",
    );
    await promptStaleEditorAssociation(h.host);
    assert.deepEqual(h.scopes.get("global"), {
      "*.json": "packman.packageJson",
      "package.json.bak": "packman.packageJson",
    });
  });

  it("removes only the Packman entry when the user clicks Remove association", async () => {
    const h = harness(
      {
        global: {
          "package.json": "packman.packageJson",
          "*.md": "vscode.markdown.preview.editor",
        },
      },
      "Remove association",
    );
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
    assert.deepEqual(h.scopes.get("global"), {
      "*.md": "vscode.markdown.preview.editor",
    });
  });

  it("removes the Packman entries from every scope that has one", async () => {
    const h = harness(
      {
        global: { "**/package.json": "packman.packageJson" },
        workspace: {
          "package.json": "packman.packageJson",
          "*.svg": "svg.preview",
        },
      },
      "Remove association",
    );
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
    assert.equal(h.scopes.get("global"), undefined);
    assert.deepEqual(h.scopes.get("workspace"), { "*.svg": "svg.preview" });
  });

  it("removes the Packman entry from a workspace folder's settings", async () => {
    const h = harness(
      {
        "folder-a": { "*.svg": "svg.preview" },
        "folder-b": { "package.json": "packman.packageJson" },
      },
      "Remove association",
    );
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
    assert.deepEqual(h.scopes.get("folder-a"), { "*.svg": "svg.preview" });
    assert.equal(h.scopes.get("folder-b"), undefined);
  });

  it("leaves settings untouched and never prompts again once dismissed", async () => {
    const stale = { "package.json": "packman.packageJson" };
    const h = harness({ global: stale }, undefined);
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
    assert.deepEqual(h.scopes.get("global"), stale);

    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
  });

  it("never prompts again when the prompt is left unanswered", async () => {
    const h = harness({ global: { "package.json": "packman.packageJson" } }, "never");
    void promptStaleEditorAssociation(h.host);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.prompts.length, 1);

    void promptStaleEditorAssociation(h.host);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.prompts.length, 1);
  });

  it("does not prompt again after the association was removed", async () => {
    const h = harness(
      { global: { "package.json": "packman.packageJson" } },
      "Remove association",
    );
    await promptStaleEditorAssociation(h.host);
    h.scopes.set("global", { "package.json": "packman.packageJson" });
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
  });
});
