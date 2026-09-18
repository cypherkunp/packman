import { basename } from "node:path";
import type {
  DetectPackageManagerResult,
  PackageManager,
} from "./detectPackageManager";
import { detectPackageManager } from "./detectPackageManager";

export type PackmanTerminal = {
  show: (preserveFocus?: boolean) => void;
  sendText: (text: string, addNewLine?: boolean) => void;
};

export type RunPackageScriptDeps = {
  detect?: (
    packageDir: string,
  ) => DetectPackageManagerResult;
  findTerminal: (name: string) => PackmanTerminal | undefined;
  createTerminal: (options: {
    name: string;
    cwd: string;
  }) => PackmanTerminal;
  warn: (message: string) => void;
  /** Mutable set of package dirs already warned for fallback. */
  warnedDirs: Set<string>;
};

export function packmanTerminalName(packageDir: string): string {
  return `Packman: ${basename(packageDir)}`;
}

export function scriptRunCommand(
  manager: PackageManager,
  scriptName: string,
): string {
  return `${manager} run ${shellSingleQuote(scriptName)}`;
}

export function runPackageScript(
  packageDir: string,
  scriptName: string,
  deps: RunPackageScriptDeps,
): void {
  const detect = deps.detect ?? detectPackageManager;
  const result = detect(packageDir);
  let manager: PackageManager = "npm";

  if (result.status === "detected") {
    manager = result.manager;
  } else {
    warnOnce(
      deps,
      packageDir,
      result.status === "ambiguous"
        ? `Packman: multiple lockfiles near ${packageDir} (${result.managers.join(", ")}); using npm.`
        : `Packman: no lockfile found near ${packageDir}; using npm.`,
    );
  }

  const name = packmanTerminalName(packageDir);
  const terminal =
    deps.findTerminal(name) ??
    deps.createTerminal({ name, cwd: packageDir });
  terminal.show(true);
  terminal.sendText(scriptRunCommand(manager, scriptName));
}

function warnOnce(
  deps: RunPackageScriptDeps,
  packageDir: string,
  message: string,
): void {
  if (deps.warnedDirs.has(packageDir)) {
    return;
  }
  deps.warnedDirs.add(packageDir);
  deps.warn(message);
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
