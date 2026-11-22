import * as vscode from "vscode";
import { registerOverlay } from "./overlayController";
import { enrichmentRefresh } from "./sessionState";
import {
  promptStaleEditorAssociation,
  type AssociationScope,
} from "./staleEditorAssociation";

const STALE_ASSOCIATION_DISMISSED = "packman.staleEditorAssociationPrompted";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(enrichmentRefresh);
  context.subscriptions.push(registerOverlay());

  context.subscriptions.push(
    vscode.commands.registerCommand("packman.openSocketSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "packman.socket",
      );
    }),
    vscode.commands.registerCommand("packman.openGithubSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "packman.github.token",
      );
    }),
    vscode.authentication.onDidChangeSessions((event) => {
      if (event.provider.id === "github") {
        enrichmentRefresh.refresh();
      }
    }),
    vscode.commands.registerCommand("packman.refreshEnrichment", () => {
      enrichmentRefresh.refresh();
    }),
  );

  void promptStaleEditorAssociation({
    readAssociations: (scope) => {
      const inspected = vscode.workspace
        .getConfiguration("workbench")
        .inspect<Record<string, string>>("editorAssociations");
      const value =
        scope === "global" ? inspected?.globalValue : inspected?.workspaceValue;
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
    },
    writeAssociations: async (scope, value) => {
      await vscode.workspace
        .getConfiguration("workbench")
        .update("editorAssociations", value, configurationTarget(scope));
    },
    showPrompt: (message, action) =>
      Promise.resolve(vscode.window.showInformationMessage(message, action)),
    wasDismissed: () =>
      context.globalState.get<boolean>(STALE_ASSOCIATION_DISMISSED) === true,
    markDismissed: () =>
      Promise.resolve(
        context.globalState.update(STALE_ASSOCIATION_DISMISSED, true),
      ),
  }).catch(() => undefined);
}

export function deactivate(): void {}

function configurationTarget(
  scope: AssociationScope,
): vscode.ConfigurationTarget {
  return scope === "global"
    ? vscode.ConfigurationTarget.Global
    : vscode.ConfigurationTarget.Workspace;
}
