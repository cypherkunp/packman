import {
  findNodeAtLocation,
  parseTree,
  type Node as JsonNode,
} from "jsonc-parser";
import { dependencyStatus, nonRegistrySource } from "./dependencyStatus";
import type {
  CellDegrade,
  EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { npmPackageUrl } from "./fetchNpmLatest";
import { DEPENDENCY_BAGS, type DependencyRow } from "./packageViewModel";

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

export type OverlayDecorationTone =
  | "outdated"
  | "latest"
  | "risk"
  | "pending"
  | "degraded";

export type OverlayDecoration = {
  range: OverlayRange;
  text: string;
  tone: OverlayDecorationTone;
};

export type OverlayHover = {
  range: OverlayRange;
  /** The Dependency this hover belongs to. */
  dependency: string;
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
  /**
   * Eager enrichment known per Dependency name. A name with no entry is
   * still loading and shows the pending marker.
   */
  enrichment?: ReadonlyMap<string, DependencyEnrichment>;
  /** Socket credentials are set, so block summaries count Socket alerts. */
  socketConfigured?: boolean;
  /** The shared GitHub budget is blocked (rate-limited). */
  githubPaused?: boolean;
  /**
   * GitHub enrichment loaded on hover, per Dependency name. A name with no
   * entry has not loaded yet and its hover shows a loading note.
   */
  github?: ReadonlyMap<string, DependencyGithub>;
  /** Local clock label (e.g. "14:05") while the GitHub budget is blocked. */
  githubPausedUntil?: string;
};

/** The GitHub-only enrichment a Dependency hover reads. */
export type DependencyGithub = Pick<
  EnrichedDependencyRow,
  | "githubUrl"
  | "issuesUrl"
  | "openIssuesCount"
  | "githubDegrade"
  | "issuesDegrade"
>;

/** The eager enrichment a Dependency decoration reads. */
export type DependencyEnrichment = Pick<
  EnrichedDependencyRow,
  "latest" | "latestDegrade" | "socket"
>;

export const RUN_SCRIPT_COMMAND = "packman.runScript";
export const MANAGE_TRUST_COMMAND = "workbench.trust.manage";
export const SOCKET_SETTINGS_COMMAND = "packman.openSocketSettings";
export const GITHUB_SETTINGS_COMMAND = "packman.openGithubSettings";
export const REFRESH_ENRICHMENT_COMMAND = "packman.refreshEnrichment";

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
  overlay.lenses.push(...blockSummaryLenses(root, context, toRange));
  overlay.decorations.push(...dependencyDecorations(root, context, toRange));
  overlay.hovers.push(...dependencyHovers(root, context, toRange));
  return overlay;
}

type DependencyNode = DependencyRow & { property: JsonNode };

/**
 * The registry Dependencies in a `package.json` text, as the Overlay sees
 * them: what the adapter feeds to eager enrichment.
 */
export function overlayDependencies(text: string): DependencyRow[] {
  const root = parseTree(text);
  if (!root || root.type !== "object") {
    return [];
  }
  return dependencyNodes(root).map(({ name, range }) => ({ name, range }));
}

function dependencyNodes(root: JsonNode): DependencyNode[] {
  return DEPENDENCY_BAGS.flatMap((bag) => {
    const block = findNodeAtLocation(root, [bag]);
    if (!block || block.type !== "object") {
      return [];
    }
    return (block.children ?? []).flatMap((property) => {
      const key = property.children?.[0];
      const value = property.children?.[1];
      if (
        property.type !== "property" ||
        typeof key?.value !== "string" ||
        value?.type !== "string" ||
        nonRegistrySource(value.value as string)
      ) {
        return [];
      }
      return [{ name: key.value, range: value.value as string, property }];
    });
  });
}

/**
 * Above each non-empty dependency block: an informational counts lens
 * (no command) followed by a `↻ Refresh` lens.
 */
function blockSummaryLenses(
  root: JsonNode,
  context: OverlayContext,
  toRange: (node: JsonNode) => OverlayRange,
): OverlayLens[] {
  const registry = dependencyNodes(root);
  return DEPENDENCY_BAGS.flatMap((bag) => {
    const block = findNodeAtLocation(root, [bag]);
    if (!block || block.type !== "object" || !block.parent) {
      return [];
    }
    const entries = (block.children ?? []).filter(
      (property) =>
        property.type === "property" &&
        typeof property.children?.[0]?.value === "string" &&
        property.children?.[1]?.type === "string",
    );
    if (entries.length === 0) {
      return [];
    }
    const inBlock = registry.filter((dependency) =>
      entries.includes(dependency.property),
    );
    const outdated = inBlock.filter((dependency) => {
      const latest = context.enrichment?.get(dependency.name)?.latest;
      return dependencyStatus(dependency.range, latest).kind === "behind";
    }).length;
    const segments = [
      plural(entries.length, "dep"),
      `${outdated} outdated`,
    ];
    if (context.socketConfigured) {
      const alerts = inBlock.filter((dependency) => {
        const socket = context.enrichment?.get(dependency.name)?.socket;
        return socket?.kind === "score" && socket.highSeverity;
      }).length;
      segments.push(plural(alerts, "Socket alert"));
    }
    if (context.githubPaused) {
      segments.push("GitHub paused");
    }
    const range = toRange(block.parent);
    return [
      { range, title: segments.join(" · "), command: "", arguments: [] },
      {
        range,
        title: "↻ Refresh",
        command: REFRESH_ENRICHMENT_COMMAND,
        arguments: [],
        tooltip: "Clear Packman enrichment and fetch it again",
      },
    ];
  });
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function dependencyDecorations(
  root: JsonNode,
  context: OverlayContext,
  toRange: (node: JsonNode) => OverlayRange,
): OverlayDecoration[] {
  return dependencyNodes(root).flatMap((dependency) => {
    const known = context.enrichment?.get(dependency.name);
    const signal = withSocketScore(
      dependencySignal(dependency.range, known),
      known,
    );
    return signal ? [{ range: toRange(dependency.property), ...signal }] : [];
  });
}

function dependencyHovers(
  root: JsonNode,
  context: OverlayContext,
  toRange: (node: JsonNode) => OverlayRange,
): OverlayHover[] {
  return dependencyNodes(root).map((dependency) => ({
    range: toRange(dependency.property),
    dependency: dependency.name,
    markdown: hoverMarkdown(
      dependency.name,
      context.enrichment?.get(dependency.name),
      context.github?.get(dependency.name),
      context.githubPausedUntil,
    ),
  }));
}

function hoverMarkdown(
  name: string,
  known: DependencyEnrichment | undefined,
  github: DependencyGithub | undefined,
  githubPausedUntil: string | undefined,
): string {
  const title = known?.latest
    ? `**${name}** · latest \`${known.latest}\``
    : `**${name}**`;
  const links = [`[npm](${npmPackageUrl(name)})`];
  if (github?.githubUrl) {
    links.push(`[GitHub](${github.githubUrl})`);
  }
  const paragraphs = [title];
  if (github?.openIssuesCount !== undefined && github.issuesUrl) {
    links.push(
      `[${github.openIssuesCount} open issues + PRs](${github.issuesUrl})`,
    );
    paragraphs.push(links.join(" · "));
    paragraphs.push("_GitHub counts open issues and pull requests together._");
  } else {
    paragraphs.push(links.join(" · "));
  }
  if (!github) {
    paragraphs.push("_GitHub repo and open issues + PRs loading…_");
  }
  const socket = known?.socket;
  if (socket?.kind === "score") {
    paragraphs.push(
      `Socket score **${socket.overall100}**/100 · [details](${socket.url})`,
    );
  } else if (socket?.kind === "cta") {
    paragraphs.push(
      `[Configure Socket…](command:${SOCKET_SETTINGS_COMMAND}) to see supply-chain scores.`,
    );
  }
  const githubNote = githubStatusNote(github, githubPausedUntil);
  if (githubNote) {
    paragraphs.push(githubNote);
  }
  const failures = failureNotes(known, github);
  if (failures.length > 0) {
    paragraphs.push(
      [...failures, `[Refresh](command:${REFRESH_ENRICHMENT_COMMAND})`].join(
        " · ",
      ),
    );
  }
  return paragraphs.join("\n\n");
}

function githubStatusNote(
  github: DependencyGithub | undefined,
  pausedUntil: string | undefined,
): string | undefined {
  const degrade = github?.githubDegrade ?? github?.issuesDegrade;
  if (degrade === "rate_limited") {
    const paused = pausedUntil
      ? `GitHub paused until ${pausedUntil}`
      : "GitHub rate-limited";
    return `${paused} · [add a token…](command:${GITHUB_SETTINGS_COMMAND})`;
  }
  return undefined;
}

function failureNotes(
  known: DependencyEnrichment | undefined,
  github: DependencyGithub | undefined,
): string[] {
  const notes: string[] = [];
  if (!known?.latest && known?.latestDegrade) {
    notes.push(`⚠ npm lookup ${DEGRADE_LABEL[known.latestDegrade]}`);
  }
  if (github?.githubDegrade && github.githubDegrade !== "rate_limited") {
    notes.push(`⚠ GitHub ${DEGRADE_LABEL[github.githubDegrade]}`);
  }
  if (github?.issuesDegrade && github.issuesDegrade !== "rate_limited") {
    notes.push(`⚠ GitHub issues + PRs ${DEGRADE_LABEL[github.issuesDegrade]}`);
  }
  return notes;
}

const DEGRADE_LABEL: Record<CellDegrade, string> = {
  offline: "offline",
  rate_limited: "rate-limited",
  timeout: "timed out",
};

type DependencySignal = { text: string; tone: OverlayDecorationTone };

function withSocketScore(
  signal: DependencySignal | undefined,
  known: DependencyEnrichment | undefined,
): DependencySignal | undefined {
  const socket = known?.socket;
  if (socket?.kind !== "score") {
    return signal;
  }
  const score = `Socket ${socket.overall100}`;
  return {
    text: signal ? `${signal.text} · ${score}` : score,
    tone: socket.highSeverity ? "risk" : (signal?.tone ?? "latest"),
  };
}

function dependencySignal(
  range: string,
  known: DependencyEnrichment | undefined,
): DependencySignal | undefined {
  if (!known) {
    return { text: "…", tone: "pending" };
  }
  if (!known.latest && known.latestDegrade) {
    return {
      text: `⚠ npm ${DEGRADE_LABEL[known.latestDegrade]}`,
      tone: "degraded",
    };
  }
  const status = dependencyStatus(range, known.latest);
  if (status.kind === "behind" && known.latest) {
    return { text: `→ ${known.latest}`, tone: "outdated" };
  }
  if (status.kind === "current") {
    return { text: "✓ latest", tone: "latest" };
  }
  return undefined;
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
