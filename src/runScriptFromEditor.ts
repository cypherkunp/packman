import * as vscode from "vscode";
import { runPackageScript } from "./runPackageScript";
import { scriptFallbackWarnedDirs } from "./sessionState";

/**
 * Runs a `package.json` script in a Packman terminal, for UI mode and the
 * Overlay alike: refuses in an untrusted workspace, and asks the user to
 * save first when the document has no folder to run in.
 */
export function runScriptFromEditor(
  packageDir: string | undefined,
  script: string,
): void {
  if (!vscode.workspace.isTrusted) {
    void vscode.window.showWarningMessage(
      "Packman: trust this workspace to run scripts.",
    );
    return;
  }
  if (!packageDir) {
    void vscode.window.showWarningMessage(
      "Packman: save this package.json to a folder to run its scripts.",
    );
    return;
  }
  runPackageScript(packageDir, script, {
    findTerminal: (name) =>
      vscode.window.terminals.find((terminal) => terminal.name === name),
    createTerminal: (options) =>
      vscode.window.createTerminal({ name: options.name, cwd: options.cwd }),
    warn: (text) => {
      void vscode.window.showWarningMessage(text);
    },
    warnedDirs: scriptFallbackWarnedDirs,
  });
}
