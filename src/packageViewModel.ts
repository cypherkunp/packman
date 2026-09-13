import type { PackageJsonObject } from "./parsePackageDocument";

export const DEPENDENCY_BAGS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type DependencyBag = (typeof DEPENDENCY_BAGS)[number];

export type IdentityField = {
  key: "name" | "version" | "description" | "license" | "engines";
  value: unknown;
};

export type ScriptButton = {
  name: string;
  command: string;
};

export type DependencyRow = {
  name: string;
  range: string;
};

export type DependencyBagSection = {
  bag: DependencyBag;
  rows: DependencyRow[];
};

export type OverrideEntry = {
  key: string;
  target: string;
};

export type GenericField = {
  key: string;
  value: unknown;
};

export type PackageViewModel = {
  identity: IdentityField[];
  scripts: ScriptButton[];
  dependencyBags: DependencyBagSection[];
  overrides: OverrideEntry[];
  generic: GenericField[];
};

const IDENTITY_KEYS = [
  "name",
  "version",
  "description",
  "license",
  "engines",
] as const;

const FIRST_CLASS_KEYS = new Set<string>([
  ...IDENTITY_KEYS,
  "scripts",
  ...DEPENDENCY_BAGS,
  "overrides",
  "resolutions",
]);

export function toPackageViewModel(pkg: PackageJsonObject): PackageViewModel {
  const identity: IdentityField[] = [];
  for (const key of IDENTITY_KEYS) {
    if (pkg[key] !== undefined) {
      identity.push({ key, value: pkg[key] });
    }
  }

  const scripts = entriesAsStrings(pkg.scripts).map(([name, command]) => ({
    name,
    command,
  }));

  const dependencyBags: DependencyBagSection[] = [];
  for (const bag of DEPENDENCY_BAGS) {
    const rows = entriesAsStrings(pkg[bag]).map(([name, range]) => ({
      name,
      range,
    }));
    if (rows.length > 0) {
      dependencyBags.push({ bag, rows });
    }
  }

  const overrides = pickOverrideEntries(pkg);

  const generic: GenericField[] = [];
  for (const [key, value] of Object.entries(pkg)) {
    if (FIRST_CLASS_KEYS.has(key)) {
      continue;
    }
    generic.push({ key, value });
  }

  return { identity, scripts, dependencyBags, overrides, generic };
}

function pickOverrideEntries(pkg: PackageJsonObject): OverrideEntry[] {
  const fromOverrides = entriesAsStrings(pkg.overrides);
  if (fromOverrides.length > 0) {
    return fromOverrides.map(([key, target]) => ({ key, target }));
  }
  return entriesAsStrings(pkg.resolutions).map(([key, target]) => ({
    key,
    target,
  }));
}

function entriesAsStrings(
  value: unknown,
): Array<[string, string]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, entry]) => {
      if (typeof entry === "string") {
        return [[key, entry] as [string, string]];
      }
      if (entry !== null && typeof entry === "object") {
        return [[key, JSON.stringify(entry)] as [string, string]];
      }
      if (entry === undefined) {
        return [];
      }
      return [[key, String(entry)] as [string, string]];
    },
  );
}
