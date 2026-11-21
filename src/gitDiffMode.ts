/**
 * Git SCM diffs (Source Control click, history compare) must stay in the text
 * diff editor. Cursor still routes those diffs through a default custom editor,
 * so UI mode has to detect them and hand the tab back.
 */

export type DiffResource = {
  scheme: string;
  fsPath: string;
  query: string;
};

const handoffKeys = new Set<string>();

export function gitDiffResourceKey(resource: DiffResource): string {
  if (resource.scheme === "git") {
    const path = gitQueryPath(resource.query);
    if (path) return path;
  }
  return resource.fsPath;
}

export function gitRef(resource: DiffResource): string | undefined {
  if (resource.scheme !== "git") return undefined;
  const query = parseGitQuery(resource.query);
  return query && typeof query.ref === "string" ? query.ref : undefined;
}

/** SCM / history diff tab titles. Parenthetical suffix is localized; `↔` is not. */
export function isGitDiffTabLabel(fileName: string, label: string): boolean {
  if (label.includes("↔")) return true;
  const prefix = `${fileName} (`;
  return label.startsWith(prefix) && label.endsWith(")");
}

/**
 * Working tree: git (`ref: "~"`) ↔ file.
 * Index: git (`HEAD`) ↔ git (`ref: ""`).
 * Anything else with two git sides keeps input order.
 */
export function pickGitDiffSides<T extends DiffResource>(
  resources: readonly T[],
): { original: T; modified: T } | undefined {
  const gits = resources.filter((resource) => resource.scheme === "git");
  const working = resources.filter((resource) => resource.scheme !== "git");

  if (gits.length >= 1 && working.length >= 1) {
    const original =
      gits.find((resource) => gitRef(resource) === "~") ??
      gits.find((resource) => gitRef(resource) === "HEAD") ??
      gits[0];
    if (!original || !working[0]) return undefined;
    return { original, modified: working[0] };
  }

  if (gits.length >= 2) {
    const modified = gits.find((resource) => gitRef(resource) === "");
    if (modified) {
      const original =
        gits.find(
          (resource) => resource !== modified && gitRef(resource) === "HEAD",
        ) ?? gits.find((resource) => resource !== modified);
      if (original) return { original, modified };
    }
    if (!gits[0] || !gits[1]) return undefined;
    return { original: gits[0], modified: gits[1] };
  }

  return undefined;
}

export function claimGitDiffHandoff(key: string): "leader" | "follower" {
  if (handoffKeys.has(key)) return "follower";
  handoffKeys.add(key);
  return "leader";
}

export function isGitDiffHandoffClaimed(key: string): boolean {
  return handoffKeys.has(key);
}

export function releaseGitDiffHandoff(key: string): void {
  handoffKeys.delete(key);
}

function gitQueryPath(query: string): string | undefined {
  const parsed = parseGitQuery(query);
  return parsed && typeof parsed.path === "string" && parsed.path.length > 0
    ? parsed.path
    : undefined;
}

function parseGitQuery(query: string): { path?: unknown; ref?: unknown } | undefined {
  if (!query) return undefined;
  try {
    const parsed = JSON.parse(query) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as { path?: unknown; ref?: unknown };
  } catch {
    return undefined;
  }
}
