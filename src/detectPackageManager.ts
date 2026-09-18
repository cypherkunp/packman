import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type DetectPackageManagerResult =
  | { status: "detected"; manager: PackageManager; lockfileDir: string }
  | {
      status: "ambiguous";
      managers: PackageManager[];
      lockfileDir: string;
    }
  | { status: "none" };

const LOCKFILE_MARKERS: ReadonlyArray<{
  file: string;
  manager: PackageManager;
}> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" },
  { file: "package-lock.json", manager: "npm" },
  { file: "npm-shrinkwrap.json", manager: "npm" },
];

/**
 * Walk up from `packageDir` looking for lockfiles. Uses the nearest directory
 * that has any lockfile marker. Multiple distinct managers in that directory
 * → ambiguous.
 */
export function detectPackageManager(
  packageDir: string,
  fileExists: (path: string) => boolean = existsSync,
): DetectPackageManagerResult {
  let dir = packageDir;
  for (;;) {
    const managers = managersInDir(dir, fileExists);
    if (managers.length === 1) {
      return { status: "detected", manager: managers[0]!, lockfileDir: dir };
    }
    if (managers.length > 1) {
      return { status: "ambiguous", managers, lockfileDir: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return { status: "none" };
    }
    dir = parent;
  }
}

function managersInDir(
  dir: string,
  fileExists: (path: string) => boolean,
): PackageManager[] {
  const found = new Set<PackageManager>();
  for (const marker of LOCKFILE_MARKERS) {
    if (fileExists(join(dir, marker.file))) {
      found.add(marker.manager);
    }
  }
  return [...found];
}
