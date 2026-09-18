import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchNpmLatest } from "./fetchNpmLatest";

describe("fetchNpmLatest", () => {
  it("returns version and repository from /latest", async () => {
    const result = await fetchNpmLatest("left-pad", async (url) => {
      assert.equal(url, "https://registry.npmjs.org/left-pad/latest");
      return jsonResponse({
        version: "1.3.0",
        repository: {
          type: "git",
          url: "git+ssh://git@github.com/stevemao/left-pad.git",
        },
      });
    });
    assert.deepEqual(result, {
      status: "ok",
      version: "1.3.0",
      repository: {
        type: "git",
        url: "git+ssh://git@github.com/stevemao/left-pad.git",
      },
      bugsUrl: undefined,
    });
  });

  it("encodes scoped package names", async () => {
    const urls: string[] = [];
    await fetchNpmLatest("@types/node", async (url) => {
      urls.push(url);
      return jsonResponse({ version: "20.0.0" });
    });
    assert.deepEqual(urls, [
      "https://registry.npmjs.org/@types%2Fnode/latest",
    ]);
  });

  it("maps 404 to not found", async () => {
    const result = await fetchNpmLatest("nope", async () =>
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );
    assert.equal(result.status, "not_found");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
