import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectPackageManager } from "./detectPackageManager";

describe("detectPackageManager", () => {
  it("detects pnpm from the package directory", () => {
    const exists = (p: string) => p === "/app/pnpm-lock.yaml";
    const result = detectPackageManager("/app", exists);
    assert.deepEqual(result, {
      status: "detected",
      manager: "pnpm",
      lockfileDir: "/app",
    });
  });

  it("walks up to a parent lockfile", () => {
    const exists = (p: string) => p === "/repo/yarn.lock";
    const result = detectPackageManager("/repo/packages/web", exists);
    assert.deepEqual(result, {
      status: "detected",
      manager: "yarn",
      lockfileDir: "/repo",
    });
  });

  it("prefers the nearest lockfile over a parent", () => {
    const exists = (p: string) =>
      p === "/repo/pnpm-lock.yaml" || p === "/repo/packages/web/package-lock.json";
    const result = detectPackageManager("/repo/packages/web", exists);
    assert.deepEqual(result, {
      status: "detected",
      manager: "npm",
      lockfileDir: "/repo/packages/web",
    });
  });

  it("treats bun.lock and bun.lockb as the same manager", () => {
    const exists = (p: string) =>
      p === "/app/bun.lock" || p === "/app/bun.lockb";
    const result = detectPackageManager("/app", exists);
    assert.deepEqual(result, {
      status: "detected",
      manager: "bun",
      lockfileDir: "/app",
    });
  });

  it("returns ambiguous when multiple managers share a directory", () => {
    const exists = (p: string) =>
      p === "/app/yarn.lock" || p === "/app/package-lock.json";
    const result = detectPackageManager("/app", exists);
    assert.equal(result.status, "ambiguous");
    if (result.status === "ambiguous") {
      assert.equal(result.lockfileDir, "/app");
      assert.deepEqual(new Set(result.managers), new Set(["yarn", "npm"]));
    }
  });

  it("returns none when no lockfile exists", () => {
    const result = detectPackageManager("/app", () => false);
    assert.deepEqual(result, { status: "none" });
  });
});
