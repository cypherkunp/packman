#!/usr/bin/env node
// Bumps the app version from the Conventional Commit message of the commit
// that was just made. Run by pre-commit at the post-commit stage (see
// .pre-commit-config.yaml).
//
//   type!: or a BREAKING CHANGE footer   -> major
//   feat                                 -> minor
//   fix, perf                            -> patch
//   any other type, or no match          -> no bump
//
// Git writes the tree before any commit-msg hook runs, so the bump cannot join
// the commit from there. Instead this writes package.json and the root version
// fields of package-lock.json, stages them, and amends the commit to include
// them. The version then differs from the parent, so the amend does not bump
// again. A commit that already changes the version (a manual bump) is left alone.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LEVEL_BY_TYPE = { feat: "minor", fix: "patch", perf: "patch" };
const HEADER = /^([A-Za-z]+)(\([^)]*\))?(!)?: \S/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const gitShow = (spec) => {
  try {
    return git(["show", spec]);
  } catch {
    return null;
  }
};

export function levelFor(message) {
  // Ignore "#" comment lines, then take the first non-empty line as the header.
  const lines = message.split("\n").filter((line) => !line.startsWith("#"));
  const header = lines.map((line) => line.trim()).find((line) => line !== "") ?? "";
  const match = HEADER.exec(header);
  if (!match) return null;

  const breaking = match[3] === "!" || BREAKING_FOOTER.test(lines.join("\n"));
  if (breaking) return "major";
  return LEVEL_BY_TYPE[match[1].toLowerCase()] ?? null;
}

export function bump(version, level) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`version "${version}" is not MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const formatJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const versionOf = (text) => JSON.parse(text).version;

function main() {
  process.chdir(git(["rev-parse", "--show-toplevel"]).trim());

  const level = levelFor(git(["log", "-1", "--format=%B"]));
  if (!level) return 0;

  const parentPkg = gitShow("HEAD^:package.json");
  const headPkg = gitShow("HEAD:package.json");
  if (parentPkg && headPkg && versionOf(parentPkg) !== versionOf(headPkg)) {
    // Already bumped (manually, or by an earlier run of this hook).
    return 0;
  }

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const current = pkg.version;
  const next = bump(current, level);
  pkg.version = next;
  writeFileSync("package.json", formatJson(pkg));
  const staged = ["package.json"];

  if (existsSync("package-lock.json")) {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    lock.version = next;
    if (lock.packages?.[""]) lock.packages[""].version = next;
    writeFileSync("package-lock.json", formatJson(lock));
    staged.push("package-lock.json");
  }

  git(["add", "--", ...staged]);
  git(["commit", "--amend", "--no-edit", "--no-verify"]);
  console.error(`bump-version: ${current} -> ${next} (${level}), included in this commit`);
  return 0;
}

// Run only when executed directly, so the helpers stay importable for tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`bump-version: ${error.message}`);
    process.exitCode = 1;
  }
}
