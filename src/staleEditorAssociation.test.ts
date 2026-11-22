import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  promptStaleEditorAssociation,
  type AssociationScope,
  type StaleAssociationHost,
} from "./staleEditorAssociation";

type Harness = {
  host: StaleAssociationHost;
  scopes: Map<AssociationScope, Record<string, string> | undefined>;
  prompts: string[];
  flags: Map<string, boolean>;
};

function harness(
  initial: Partial<Record<AssociationScope, Record<string, string>>>,
  answer: "Remove association" | undefined,
  flags = new Map<string, boolean>(),
): Harness {
  const scopes = new Map<AssociationScope, Record<string, string> | undefined>(
    Object.entries(initial) as Array<[AssociationScope, Record<string, string>]>,
  );
  const prompts: string[] = [];
  const host: StaleAssociationHost = {
    readAssociations: (scope) => scopes.get(scope),
    writeAssociations: async (scope, value) => {
      scopes.set(scope, value);
    },
    showPrompt: async (message, action) => {
      prompts.push(message);
      assert.equal(action, "Remove association");
      return answer;
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

  it("leaves settings untouched and never prompts again once dismissed", async () => {
    const stale = { "package.json": "packman.packageJson" };
    const h = harness({ global: stale }, undefined);
    await promptStaleEditorAssociation(h.host);
    assert.equal(h.prompts.length, 1);
    assert.deepEqual(h.scopes.get("global"), stale);

    await promptStaleEditorAssociation(h.host);
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
