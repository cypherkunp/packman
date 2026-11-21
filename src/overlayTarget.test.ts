import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRunScriptsFrom,
  isOverlayTarget,
  overlayTargetDocuments,
} from "./overlayTarget";

describe("isOverlayTarget", () => {
  it("accepts package.json files, including unsaved ones", () => {
    assert.equal(isOverlayTarget("/work/app/package.json"), true);
    assert.equal(isOverlayTarget("C:\\work\\app\\package.json"), true);
    assert.equal(isOverlayTarget("package.json"), true);
  });

  it("rejects package.json under node_modules", () => {
    assert.equal(
      isOverlayTarget("/work/app/node_modules/leftpad/package.json"),
      false,
    );
    assert.equal(
      isOverlayTarget("C:\\work\\node_modules\\@s\\x\\package.json"),
      false,
    );
  });

  it("rejects other files", () => {
    assert.equal(isOverlayTarget("/work/app/package-lock.json"), false);
    assert.equal(isOverlayTarget("/work/app/my-package.json"), false);
    assert.equal(isOverlayTarget("/work/app/tsconfig.json"), false);
  });
});

describe("overlayTargetDocuments", () => {
  it("keeps every open package.json document, visible or not", () => {
    const documents = [
      { uri: { path: "/work/app/package.json" } },
      { uri: { path: "/work/app/README.md" } },
      { uri: { path: "/work/lib/package.json" } },
      { uri: { path: "/work/app/node_modules/x/package.json" } },
    ];

    assert.deepEqual(
      overlayTargetDocuments(documents).map((document) => document.uri.path),
      ["/work/app/package.json", "/work/lib/package.json"],
    );
  });
});

describe("canRunScriptsFrom", () => {
  it("allows saved and unsaved documents", () => {
    assert.equal(canRunScriptsFrom("file"), true);
    assert.equal(canRunScriptsFrom("untitled"), true);
  });

  it("rejects git and other virtual documents, such as a diff's old side", () => {
    assert.equal(canRunScriptsFrom("git"), false);
    assert.equal(canRunScriptsFrom("vscode-remote"), false);
    assert.equal(canRunScriptsFrom("vscode-vfs"), false);
  });
});
