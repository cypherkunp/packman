import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { npmPurl, socketPackageUrl } from "./socketPurl";

describe("npmPurl", () => {
  it("builds unscoped and scoped PURLs with version", () => {
    assert.equal(npmPurl("express", "4.19.2"), "pkg:npm/express@4.19.2");
    assert.equal(
      npmPurl("@types/node", "20.0.0"),
      "pkg:npm/%40types%2Fnode@20.0.0",
    );
  });
});

describe("socketPackageUrl", () => {
  it("deep-links to socket.dev for the package", () => {
    assert.equal(
      socketPackageUrl("express"),
      "https://socket.dev/npm/package/express",
    );
    assert.equal(
      socketPackageUrl("@types/node"),
      "https://socket.dev/npm/package/@types/node",
    );
  });
});
