/**
 * Compares a Dependency's declared range with the registry's latest
 * version, so the Overlay can say whether a Dependency needs attention
 * instead of leaving the reader to diff versions by hand.
 */

export type VersionGap = "major" | "minor" | "patch";

export type DependencyStatus =
  /** Range does not resolve from the npm registry (workspace:, file:, git…). */
  | { kind: "non-registry"; source: string }
  /** Latest is allowed by the range. */
  | { kind: "current" }
  /** Latest falls outside the range. `breaking` = a semver-breaking jump. */
  | { kind: "behind"; gap: VersionGap; breaking: boolean }
  /** Range or latest could not be interpreted. */
  | { kind: "unknown" };

type Version = { major: number; minor: number; patch: number };

/** Partial version as written in a range: `1`, `1.2`, `1.x`, `1.2.3`. */
type Partial = { major: number; minor?: number; patch?: number };

const PROTOCOL_SOURCES: ReadonlyArray<[RegExp, string]> = [
  [/^workspace:/, "workspace"],
  [/^catalog:/, "catalog"],
  [/^(file|link|portal):/, "local"],
  [/^npm:/, "alias"],
  [/^(git(\+[a-z]+)?|github|gitlab|bitbucket):/, "git"],
  [/^https?:/, "url"],
];

/**
 * Names where a range resolves from when it is not the npm registry,
 * e.g. `workspace:*` → "workspace". Returns undefined for registry ranges.
 */
export function nonRegistrySource(range: string): string | undefined {
  const trimmed = range.trim();
  for (const [pattern, source] of PROTOCOL_SOURCES) {
    if (pattern.test(trimmed)) {
      return source;
    }
  }
  // GitHub shorthand: owner/repo or owner/repo#ref
  if (/^[\w.-]+\/[\w.-]+(#.*)?$/.test(trimmed)) {
    return "git";
  }
  return undefined;
}

export function dependencyStatus(
  range: string,
  latest: string | undefined,
): DependencyStatus {
  const source = nonRegistrySource(range);
  if (source) {
    return { kind: "non-registry", source };
  }
  if (!latest) {
    return { kind: "unknown" };
  }
  const latestVersion = parseVersion(latest);
  if (!latestVersion) {
    return { kind: "unknown" };
  }

  const alternatives = range
    .split("||")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (alternatives.length === 0) {
    return { kind: "current" };
  }

  let highestFloor: Version | undefined;
  for (const alternative of alternatives) {
    const set = comparatorSet(alternative);
    if (!set) {
      return { kind: "unknown" };
    }
    if (set.every((test) => test(latestVersion))) {
      return { kind: "current" };
    }
    const floor = rangeFloor(alternative);
    if (floor && (!highestFloor || compare(floor, highestFloor) > 0)) {
      highestFloor = floor;
    }
  }

  if (!highestFloor || compare(latestVersion, highestFloor) <= 0) {
    // Latest is below the declared floor (e.g. a prerelease range); nothing to flag.
    return { kind: "unknown" };
  }

  const gap: VersionGap =
    latestVersion.major !== highestFloor.major
      ? "major"
      : latestVersion.minor !== highestFloor.minor
        ? "minor"
        : "patch";
  const breaking =
    gap === "major" ||
    (highestFloor.major === 0 && (gap === "minor" || highestFloor.minor === 0));
  return { kind: "behind", gap, breaking };
}

type Test = (version: Version) => boolean;

function comparatorSet(alternative: string): Test[] | undefined {
  const hyphen = alternative.match(/^(\S+)\s+-\s+(\S+)$/);
  if (hyphen) {
    const low = parsePartial(hyphen[1] ?? "");
    const high = parsePartial(hyphen[2] ?? "");
    if (!low || !high) return undefined;
    return [gte(fill(low)), upperInclusive(high)];
  }

  const tokens = alternative
    .replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1")
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const tests: Test[] = [];
  for (const token of tokens) {
    const parsed = comparator(token);
    if (!parsed) return undefined;
    tests.push(...parsed);
  }
  return tests;
}

function comparator(token: string): Test[] | undefined {
  if (token === "*" || token === "x" || token === "X" || token === "latest") {
    return [];
  }
  const match = token.match(/^(\^|~>?|>=|<=|>|<|=)?v?(.+)$/);
  if (!match) return undefined;
  const op = match[1] ?? "";
  const partial = parsePartial(match[2] ?? "");
  if (!partial) return undefined;
  const floor = fill(partial);

  switch (op) {
    case "^":
      return [gte(floor), lt(caretCeiling(partial))];
    case "~":
    case "~>":
      return [
        gte(floor),
        lt(
          partial.minor === undefined
            ? { major: partial.major + 1, minor: 0, patch: 0 }
            : { major: partial.major, minor: partial.minor + 1, patch: 0 },
        ),
      ];
    case ">=":
      return [gte(floor)];
    case ">":
      return [
        partial.minor === undefined
          ? gte({ major: partial.major + 1, minor: 0, patch: 0 })
          : partial.patch === undefined
            ? gte({ major: partial.major, minor: partial.minor + 1, patch: 0 })
            : (v) => compare(v, floor) > 0,
      ];
    case "<=":
      return [upperInclusive(partial)];
    case "<":
      return [lt(floor)];
    default:
      // Exact or x-range: 1.2.3, 1.2.x, 1.x
      if (partial.patch !== undefined && partial.minor !== undefined) {
        return [(v) => compare(v, floor) === 0];
      }
      return [gte(floor), upperInclusive(partial)];
  }
}

function caretCeiling(partial: Partial): Version {
  if (partial.major > 0 || partial.minor === undefined) {
    return { major: partial.major + 1, minor: 0, patch: 0 };
  }
  if (partial.minor > 0 || partial.patch === undefined) {
    return { major: 0, minor: partial.minor + 1, patch: 0 };
  }
  return { major: 0, minor: 0, patch: partial.patch + 1 };
}

/** `<= 1.2` means `< 1.3.0`; `<= 1.2.3` means `<= 1.2.3`. */
function upperInclusive(partial: Partial): Test {
  if (partial.minor === undefined) {
    return lt({ major: partial.major + 1, minor: 0, patch: 0 });
  }
  if (partial.patch === undefined) {
    return lt({ major: partial.major, minor: partial.minor + 1, patch: 0 });
  }
  const exact = fill(partial);
  return (v) => compare(v, exact) <= 0;
}

function rangeFloor(alternative: string): Version | undefined {
  const match = alternative.match(/(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?/);
  if (!match) return undefined;
  const partial = parsePartial(match[0]);
  return partial ? fill(partial) : undefined;
}

function gte(floor: Version): Test {
  return (v) => compare(v, floor) >= 0;
}

function lt(ceiling: Version): Test {
  return (v) => compare(v, ceiling) < 0;
}

function parsePartial(text: string): Partial | undefined {
  const match = text.match(
    /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:[-+].*)?$/,
  );
  if (!match) return undefined;
  const part = (value: string | undefined) =>
    value === undefined || /^[xX*]$/.test(value) ? undefined : Number(value);
  const minor = part(match[2]);
  const patch = minor === undefined ? undefined : part(match[3]);
  return { major: Number(match[1]), minor, patch };
}

function parseVersion(text: string): Version | undefined {
  const match = text.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function fill(partial: Partial): Version {
  return {
    major: partial.major,
    minor: partial.minor ?? 0,
    patch: partial.patch ?? 0,
  };
}

function compare(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}
