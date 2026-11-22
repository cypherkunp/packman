import * as vscode from "vscode";
import { registerOverlay } from "./overlayController";
import { enrichmentRefresh } from "./sessionState";
import { promptStaleEditorAssociation } from "./staleEditorAssociation";

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
    vscode.commands.registerCommand("packman.refreshEnrichment", () => {
      enrichmentRefresh.refresh();
    }),
  );

  void promptStaleEditorAssociation<AssociationScope>({
    scopes: () => [
      { target: vscode.ConfigurationTarget.Global },
      { target: vscode.ConfigurationTarget.Workspace },
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => ({
        target: vscode.ConfigurationTarget.WorkspaceFolder,
        folder: folder.uri,
      })),
    ],
    readAssociations: (scope) => {
      const inspected = vscode.workspace
        .getConfiguration("workbench", scope.folder)
        .inspect<Record<string, string>>("editorAssociations");
      const value =
        scope.target === vscode.ConfigurationTarget.Global
          ? inspected?.globalValue
          : scope.target === vscode.ConfigurationTarget.Workspace
            ? inspected?.workspaceValue
            : inspected?.workspaceFolderValue;
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : undefined;
    },
    writeAssociations: async (scope, value) => {
      await vscode.workspace
        .getConfiguration("workbench", scope.folder)
        .update("editorAssociations", value, scope.target);
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

/** A settings level `workbench.editorAssociations` can be set at. */
type AssociationScope = {
  target: vscode.ConfigurationTarget;
  /** The workspace folder, for `WorkspaceFolder`. */
  folder?: vscode.Uri;
};
