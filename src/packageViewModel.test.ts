import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toPackageViewModel } from "./packageViewModel";

describe("toPackageViewModel", () => {
  it("maps first-class identity fields and omits missing ones", () => {
    const model = toPackageViewModel({
      name: "demo",
      version: "1.2.3",
      description: "A demo",
      license: "MIT",
      engines: { node: ">=18" },
    });
    assert.deepEqual(model.identity, [
      { key: "name", value: "demo" },
      { key: "version", value: "1.2.3" },
      { key: "description", value: "A demo" },
      { key: "license", value: "MIT" },
      { key: "engines", value: { node: ">=18" } },
    ]);
  });

  it("builds Script buttons from scripts entries", () => {
    const model = toPackageViewModel({
      scripts: { build: "tsc", test: "node --test" },
    });
    assert.deepEqual(model.scripts, [
      { name: "build", command: "tsc" },
      { name: "test", command: "node --test" },
    ]);
  });

  it("builds Dependency rows per non-empty bag only", () => {
    const model = toPackageViewModel({
      dependencies: { leftpad: "^1.0.0" },
      devDependencies: {},
      peerDependencies: { react: "^18" },
      optionalDependencies: undefined,
    });
    assert.deepEqual(
      model.dependencyBags.map((b) => b.bag),
      ["dependencies", "peerDependencies"],
    );
    assert.deepEqual(model.dependencyBags[0]?.rows, [
      { name: "leftpad", range: "^1.0.0" },
    ]);
    assert.deepEqual(model.dependencyBags[1]?.rows, [
      { name: "react", range: "^18" },
    ]);
  });

  it("maps Override entries from overrides or resolutions", () => {
    const withOverrides = toPackageViewModel({
      overrides: { foo: "1.0.0", "bar@1": "2.0.0" },
    });
    assert.deepEqual(withOverrides.overrides, [
      { key: "foo", target: "1.0.0" },
      { key: "bar@1", target: "2.0.0" },
    ]);

    const withResolutions = toPackageViewModel({
      resolutions: { lodash: "4.17.21" },
    });
    assert.deepEqual(withResolutions.overrides, [
      { key: "lodash", target: "4.17.21" },
    ]);

    const emptyOverridesFallsThrough = toPackageViewModel({
      overrides: {},
      resolutions: { lodash: "4.17.21" },
    });
    assert.deepEqual(emptyOverridesFallsThrough.overrides, [
      { key: "lodash", target: "4.17.21" },
    ]);
  });

  it("puts unknown keys in generic and excludes first-class keys", () => {
    const model = toPackageViewModel({
      name: "demo",
      eslintConfig: { root: true },
      prettier: { semi: false },
      scripts: { lint: "eslint ." },
    });
    assert.deepEqual(
      model.generic.map((g) => g.key),
      ["eslintConfig", "prettier"],
    );
    assert.equal(model.scripts.length, 1);
  });

  it("omits empty scripts and override sections", () => {
    const model = toPackageViewModel({ name: "solo", scripts: {}, overrides: {} });
    assert.equal(model.scripts.length, 0);
    assert.equal(model.overrides.length, 0);
    assert.equal(model.dependencyBags.length, 0);
  });
});
