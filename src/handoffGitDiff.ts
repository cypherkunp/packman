import { basename } from "node:path";
import * as vscode from "vscode";
import {
  claimGitDiffHandoff,
  gitDiffResourceKey,
  isGitDiffHandoffClaimed,
  isGitDiffTabLabel,
  pickGitDiffSides,
  releaseGitDiffHandoff,
  type DiffResource,
} from "./gitDiffMode";

type TrackedResource = DiffResource & { uri: vscode.Uri };

/**
 * `override: true` is how this host forces the built-in text editor.
 * The public TextDocumentShowOptions type does not list it; the workbench
 * maps a boolean `override` to the `default` editor id.
 */
type TextDiffOptions = vscode.TextDocumentShowOptions & { override?: boolean };

const PAIR_WAIT_MS = 300;
const HANDOFF_HOLD_MS = 1_000;

/**
 * Returns true when this resolve is a git diff and UI mode must not render.
 * The leading side reopens the same pair in the text diff editor.
 */
export async function handoffGitDiffToTextEditor(
  document: vscode.TextDocument,
  panel: vscode.WebviewPanel,
): Promise<boolean> {
  const key = gitDiffResourceKey(toDiffResource(document.uri));
  const fileName = basename(key);

  if (document.uri.scheme !== "git") {
    await delay(0);
    const label = findGitDiffTabLabel(panel.viewColumn, fileName);
    if (!label) return false;
    if (isGitDiffHandoffClaimed(key)) return true;
  }

  if (claimGitDiffHandoff(key) === "follower") return true;

  try {
    const pair = await waitForGitDiffPair(document, key);
    const title = findGitDiffTabLabel(panel.viewColumn, fileName) ?? fileName;
    const column = panel.viewColumn;
    let disposed = false;
    const disposeSub = panel.onDidDispose(() => {
      disposed = true;
    });
    await closeActiveGitDiffTab(fileName);

    if (!pair) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        document.uri,
        "default",
        column,
      );
    } else {
      const options: TextDiffOptions = {
        override: true,
        preview: true,
        viewColumn: column,
      };
      await vscode.commands.executeCommand(
        "vscode.diff",
        pair.original.uri,
        pair.modified.uri,
        title,
        options,
      );
    }

    if (!disposed) panel.dispose();
    disposeSub.dispose();
    return true;
  } finally {
    setTimeout(() => releaseGitDiffHandoff(key), HANDOFF_HOLD_MS);
  }
}

function toDiffResource(uri: vscode.Uri): DiffResource {
  return { scheme: uri.scheme, fsPath: uri.fsPath, query: uri.query };
}

function findGitDiffTabLabel(
  viewColumn: vscode.ViewColumn | undefined,
  fileName: string,
): string | undefined {
  const group =
    viewColumn === undefined
      ? vscode.window.tabGroups.activeTabGroup
      : vscode.window.tabGroups.all.find(
          (candidate) => candidate.viewColumn === viewColumn,
        );
  const label = group?.activeTab?.label;
  if (label && isGitDiffTabLabel(fileName, label)) return label;
  return undefined;
}

async function closeActiveGitDiffTab(fileName: string): Promise<void> {
  const label = vscode.window.tabGroups.activeTabGroup.activeTab?.label;
  if (!label || !isGitDiffTabLabel(fileName, label)) return;
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
}

async function waitForGitDiffPair(
  document: vscode.TextDocument,
  key: string,
): Promise<{ original: TrackedResource; modified: TrackedResource } | undefined> {
  const read = () => {
    const docs = vscode.workspace.textDocuments.filter(
      (doc) => gitDiffResourceKey(toDiffResource(doc.uri)) === key,
    );
    const uris = new Set(docs.map((doc) => doc.uri.toString()));
    const all = uris.has(document.uri.toString()) ? docs : [...docs, document];
    const tracked: TrackedResource[] = all.map((doc) => ({
      uri: doc.uri,
      ...toDiffResource(doc.uri),
    }));
    return pickGitDiffSides(tracked);
  };

  const immediate = read();
  if (immediate) return immediate;

  return new Promise((resolve) => {
    const sub = vscode.workspace.onDidOpenTextDocument(() => {
      const pair = read();
      if (!pair) return;
      clearTimeout(timer);
      sub.dispose();
      resolve(pair);
    });
    const timer = setTimeout(() => {
      sub.dispose();
      resolve(read());
    }, PAIR_WAIT_MS);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
