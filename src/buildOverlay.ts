import {
  findNodeAtLocation,
  parseTree,
  type Node as JsonNode,
} from "jsonc-parser";

/**
 * Pure Overlay builder: turns `package.json` text plus a context into plain
 * descriptions of CodeLenses, end-of-line decorations and hovers. It never
 * imports `vscode`; the adapter maps its output onto VS Code types 1:1.
 */

export type OverlayPosition = { line: number; character: number };

export type OverlayRange = { start: OverlayPosition; end: OverlayPosition };

export type OverlayLens = {
  range: OverlayRange;
  title: string;
  command: string;
  arguments: unknown[];
  tooltip?: string;
};

export type OverlayDecorationTone = "outdated" | "latest" | "risk" | "pending";

export type OverlayDecoration = {
  range: OverlayRange;
  text: string;
  tone: OverlayDecorationTone;
};

export type OverlayHover = {
  range: OverlayRange;
  /** Markdown; may contain `command:` links. */
  markdown: string;
};

export type Overlay = {
  lenses: OverlayLens[];
  decorations: OverlayDecoration[];
  hovers: OverlayHover[];
};

export type OverlayContext = {
  /** Document URI as a string; passed back as the first command argument. */
  documentUri: string;
  /** `packman.overlay.enabled` combined with the session toggle. */
  enabled: boolean;
  /** Workspace Trust. Untrusted workspaces get no Run lenses. */
  trusted: boolean;
  /** Read-only or diff contexts get no script lenses. */
  readOnly: boolean;
};

export const RUN_SCRIPT_COMMAND = "packman.runScript";
export const MANAGE_TRUST_COMMAND = "workbench.trust.manage";

export function emptyOverlay(): Overlay {
  return { lenses: [], decorations: [], hovers: [] };
}

export function buildOverlay(text: string, context: OverlayContext): Overlay {
  const overlay = emptyOverlay();
  if (!context.enabled) {
    return overlay;
  }
  const root = parseTree(text);
  if (!root || root.type !== "object") {
    return overlay;
  }
  const toRange = rangeMapper(text);
  overlay.lenses.push(...scriptLenses(root, context, toRange));
  return overlay;
}

function scriptLenses(
  root: JsonNode,
  context: OverlayContext,
  toRange: (node: JsonNode) => OverlayRange,
): OverlayLens[] {
  if (context.readOnly) {
    return [];
  }
  const scripts = findNodeAtLocation(root, ["scripts"]);
  if (!scripts || scripts.type !== "object" || !scripts.parent) {
    return [];
  }
  const entries = (scripts.children ?? []).filter(
    (property) =>
      property.type === "property" &&
      typeof property.children?.[0]?.value === "string" &&
      property.children?.[1]?.type === "string",
  );
  if (entries.length === 0) {
    return [];
  }
  if (!context.trusted) {
    return [
      {
        range: toRange(scripts.parent),
        title: "Trust workspace to run scripts",
        command: MANAGE_TRUST_COMMAND,
        arguments: [],
      },
    ];
  }
  return entries.map((property) => {
    const name = property.children![0]!.value as string;
    return {
      range: toRange(property),
      title: "▶ Run",
      command: RUN_SCRIPT_COMMAND,
      arguments: [context.documentUri, name],
      tooltip: `Run the "${name}" script`,
    };
  });
}

function rangeMapper(text: string): (node: JsonNode) => OverlayRange {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const position = (offset: number): OverlayPosition => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid]! <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return { line: low, character: offset - lineStarts[low]! };
  };
  return (node) => ({
    start: position(node.offset),
    end: position(node.offset + node.length),
  });
}
