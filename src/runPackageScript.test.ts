import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  packmanTerminalName,
  runPackageScript,
  scriptRunCommand,
  type PackmanTerminal,
} from "./runPackageScript";

describe("runPackageScript", () => {
  it("builds a quoted run command per manager", () => {
    assert.equal(scriptRunCommand("pnpm", "build"), "pnpm run 'build'");
    assert.equal(
      scriptRunCommand("npm", "pre'publish"),
      "npm run 'pre'\\''publish'",
    );
  });

  it("names the terminal Packman: <folder>", () => {
    assert.equal(packmanTerminalName("/repo/packages/web"), "Packman: web");
  });

  it("reuses an existing Packman terminal and does not create another", () => {
    const sent: string[] = [];
    const existing: PackmanTerminal = {
      show: () => undefined,
      sendText: (t) => {
        sent.push(t);
      },
    };
    let created = 0;
    runPackageScript("/app", "test", {
      detect: () => ({
        status: "detected",
        manager: "pnpm",
        lockfileDir: "/app",
      }),
      findTerminal: (name) =>
        name === "Packman: app" ? existing : undefined,
      createTerminal: () => {
        created += 1;
        return existing;
      },
      warn: () => undefined,
      warnedDirs: new Set(),
    });
    assert.equal(created, 0);
    assert.deepEqual(sent, ["pnpm run 'test'"]);
  });

  it("warns once on ambiguous lockfiles and falls back to npm", () => {
    const warnings: string[] = [];
    const sent: string[] = [];
    const terminal: PackmanTerminal = {
      show: () => undefined,
      sendText: (t) => {
        sent.push(t);
      },
    };
    const warnedDirs = new Set<string>();
    const deps = {
      detect: () =>
        ({
          status: "ambiguous" as const,
          managers: ["yarn" as const, "npm" as const],
          lockfileDir: "/app",
        }),
      findTerminal: () => undefined,
      createTerminal: () => terminal,
      warn: (m: string) => {
        warnings.push(m);
      },
      warnedDirs,
    };
    runPackageScript("/app", "build", deps);
    runPackageScript("/app", "build", deps);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /using npm/);
    assert.deepEqual(sent, ["npm run 'build'", "npm run 'build'"]);
  });

  it("warns once when no lockfile is found", () => {
    const warnings: string[] = [];
    const terminal: PackmanTerminal = {
      show: () => undefined,
      sendText: () => undefined,
    };
    const warnedDirs = new Set<string>();
    const deps = {
      detect: () => ({ status: "none" as const }),
      findTerminal: () => undefined,
      createTerminal: () => terminal,
      warn: (m: string) => {
        warnings.push(m);
      },
      warnedDirs,
    };
    runPackageScript("/app", "build", deps);
    runPackageScript("/app", "lint", deps);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /no lockfile/i);
  });
});
