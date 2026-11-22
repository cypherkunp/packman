import { findNodeAtLocation, type Node as JsonNode } from "jsonc-parser";
import { dependencyStatus, nonRegistrySource } from "./dependencyStatus";
import type {
  CellDegrade,
  DependencyGithub,
  EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { npmPackageUrl } from "./fetchNpmLatest";
import { overlayRoot, parseWellFormed } from "./overlayTree";
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
  | "outdated-major"
  | "latest"
  | "risk"
  | "pending"
  | "degraded"
  | "paused"
  | "source"
  | "neutral";

/**
 * Theme colour per tone (VS Code `ThemeColor` ids only). Outdated escalates
 * from info to warning for a major jump; a risky Socket score is an error;
 * paused, source and degraded parts are dimmed.
 */
export const OVERLAY_TONE_COLORS: Record<OverlayDecorationTone, string> = {
  latest: "editorCodeLens.foreground",
  neutral: "editorCodeLens.foreground",
  pending: "editorCodeLens.foreground",
  outdated: "editorInfo.foreground",
  "outdated-major": "editorWarning.foreground",
  risk: "editorError.foreground",
  paused: "disabledForeground",
  source: "disabledForeground",
  degraded: "disabledForeground",
};

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
  /**
   * The document's most recent well-formed text. While the current text is
   * broken mid-edit, only entries that existed here keep their Overlay.
   */
  lastGoodText?: string;
};

/** The GitHub-only enrichment a Dependency hover reads. */
export type { DependencyGithub };

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
  const root = overlayRoot(text, context.lastGoodText);
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
 * them: what the adapter feeds to eager enrichment. Broken (mid-edit) text
 * yields none, so intermediate states never trigger fetches.
 */
export function overlayDependencies(text: string): DependencyRow[] {
  const root = parseWellFormed(text);
  if (root?.type !== "object") {
    return [];
  }
  return dependencyNodes(root).map(({ name, range }) => ({ name, range }));
}

/** Inclusive start and exclusive end lines, like an editor's visible range. */
export type OverlayLineRange = { start: number; end: number };

/**
 * `overlayDependencies`, with the Dependencies whose entry starts inside one
 * of `visibleRanges` moved to the front (document order kept within each
 * part), so what is on screen is fetched first.
 */
export function overlayDependenciesVisibleFirst(
  text: string,
  visibleRanges: readonly OverlayLineRange[] = [],
): DependencyRow[] {
  const root = parseWellFormed(text);
  if (root?.type !== "object") {
    return [];
  }
  const toRange = rangeMapper(text);
  const visible: DependencyRow[] = [];
  const rest: DependencyRow[] = [];
  for (const { name, range, property } of dependencyNodes(root)) {
    const line = toRange(property).start.line;
    const onScreen = visibleRanges.some(
      (visibleRange) => line >= visibleRange.start && line < visibleRange.end,
    );
    (onScreen ? visible : rest).push({ name, range });
  }
  return [...visible, ...rest];
}

/** The registry (npm) Dependencies: the ones that get enrichment. */
function dependencyNodes(root: JsonNode): DependencyNode[] {
  return allDependencyNodes(root).filter((dependency) => !dependency.source);
}

/**
 * Every Dependency in the four dependency blocks. `source` names where a
 * non-npm Dependency resolves from (workspace, git, …).
 */
function allDependencyNodes(
  root: JsonNode,
): Array<DependencyNode & { source?: string }> {
  return DEPENDENCY_BAGS.flatMap((bag) => {
    const block = findNodeAtLocation(root, [bag]);
    if (!block || block.type !== "object") {
      return [];
    }
    return stringEntries(block).map((property) => {
      const name = property.children![0]!.value as string;
      const range = property.children![1]!.value as string;
      return { name, range, property, source: nonRegistrySource(range) };
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
    const entries = stringEntries(block);
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
  return allDependencyNodes(root).map((dependency) => {
    const range = toRange(dependency.property);
    if (dependency.source) {
      return { range, text: dependency.source, tone: "source" as const };
    }
    const signal = dependencySignal(
      dependency.range,
      context.enrichment?.get(dependency.name),
      context.github?.get(dependency.name),
      context.githubPaused ?? false,
    );
    return { range, ...signal };
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
  enrichment: DependencyEnrichment | undefined,
  github: DependencyGithub | undefined,
  githubPausedUntil: string | undefined,
): string {
  const title = enrichment?.latest
    ? `**${name}** · latest \`${enrichment.latest}\``
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
  const socket = enrichment?.socket;
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
  const failures = failureNotes(enrichment, github);
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
  enrichment: DependencyEnrichment | undefined,
  github: DependencyGithub | undefined,
): string[] {
  const notes: string[] = [];
  if (!enrichment?.latest && enrichment?.latestDegrade) {
    notes.push(`⚠ npm lookup ${DEGRADE_LABEL[enrichment.latestDegrade]}`);
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

/** When parts disagree, the line takes the most urgent part's tone. */
const TONE_PRIORITY: readonly OverlayDecorationTone[] = [
  "risk",
  "outdated-major",
  "outdated",
  "degraded",
  "latest",
  "neutral",
  "paused",
];

/**
 * The Dependency signal: version, open issues + PRs, and Socket parts joined
 * with ` · `. Unknown parts are left out; with nothing known it is pending.
 */
function dependencySignal(
  range: string,
  enrichment: DependencyEnrichment | undefined,
  github: DependencyGithub | undefined,
  githubPaused: boolean,
): DependencySignal {
  const parts = [
    versionPart(range, enrichment),
    issuesPart(github, githubPaused),
    socketPart(enrichment),
  ].filter((part): part is DependencySignal => part !== undefined);
  if (parts.length === 0) {
    return { text: "…", tone: "pending" };
  }
  const tone =
    TONE_PRIORITY.find((candidate) =>
      parts.some((part) => part.tone === candidate),
    ) ?? "neutral";
  return { text: parts.map((part) => part.text).join(" · "), tone };
}

function versionPart(
  range: string,
  enrichment: DependencyEnrichment | undefined,
): DependencySignal | undefined {
  if (!enrichment) {
    return undefined;
  }
  if (!enrichment.latest && enrichment.latestDegrade) {
    return {
      text: `⚠ npm ${DEGRADE_LABEL[enrichment.latestDegrade]}`,
      tone: "degraded",
    };
  }
  const status = dependencyStatus(range, enrichment.latest);
  if (status.kind === "behind" && enrichment.latest) {
    return {
      text: `↑ ${enrichment.latest}`,
      tone: status.breaking ? "outdated-major" : "outdated",
    };
  }
  if (status.kind === "current") {
    return { text: "✓ latest", tone: "latest" };
  }
  return undefined;
}

/** GitHub's open count covers issues and PRs together. */
function issuesPart(
  github: DependencyGithub | undefined,
  githubPaused: boolean,
): DependencySignal | undefined {
  if (github?.openIssuesCount !== undefined) {
    return { text: plural(github.openIssuesCount, "issue"), tone: "neutral" };
  }
  const rateLimited =
    github?.githubDegrade === "rate_limited" ||
    github?.issuesDegrade === "rate_limited";
  // A loaded result with no repo and no failure means there is nothing to count.
  const repoMayExist = !github || github.githubUrl !== undefined;
  if (rateLimited || (githubPaused && repoMayExist)) {
    return { text: "issues ⏸", tone: "paused" };
  }
  return undefined;
}

/** Left out unless Socket is configured and scored this Dependency. */
function socketPart(
  enrichment: DependencyEnrichment | undefined,
): DependencySignal | undefined {
  const socket = enrichment?.socket;
  if (socket?.kind !== "score") {
    return undefined;
  }
  return socket.highSeverity
    ? { text: `⚠ Socket ${socket.overall100}`, tone: "risk" }
    : { text: `Socket ${socket.overall100}`, tone: "neutral" };
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
  const entries = stringEntries(scripts);
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

/** A block's `"name": "string"` entries: scripts, or Dependencies by range. */
function stringEntries(block: JsonNode): JsonNode[] {
  return (block.children ?? []).filter(
    (property) =>
      property.type === "property" &&
      typeof property.children?.[0]?.value === "string" &&
      property.children?.[1]?.type === "string",
  );
}
