import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichDependencyRow } from "./enrichDependencyRow";

describe("enrichDependencyRow", () => {
  it("fills latest, GitHub link, and open issues when resolvable", async () => {
    const enriched = await enrichDependencyRow(
      { name: "left-pad", range: "^1.0.0" },
      {
        githubToken: undefined,
        fetchImpl: async (url) => {
          if (url.includes("registry.npmjs.org")) {
            return jsonResponse({
              version: "1.3.0",
              repository: {
                url: "git+ssh://git@github.com/stevemao/left-pad.git",
              },
            });
          }
          return jsonResponse({
            html_url: "https://github.com/stevemao/left-pad",
            open_issues_count: 7,
          });
        },
      },
    );

    assert.equal(enriched.name, "left-pad");
    assert.equal(enriched.range, "^1.0.0");
    assert.equal(enriched.npmUrl, "https://www.npmjs.com/package/left-pad");
    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
    assert.equal(enriched.issuesUrl, "https://github.com/stevemao/left-pad/issues");
    assert.equal(enriched.openIssuesCount, 7);
  });

  it("keeps npm repo URL and leaves issues empty on GitHub rate limit", async () => {
    const enriched = await enrichDependencyRow(
      { name: "left-pad", range: "^1.0.0" },
      {
        fetchImpl: async (url) => {
          if (url.includes("registry.npmjs.org")) {
            return jsonResponse({
              version: "1.3.0",
              repository: {
                url: "git+https://github.com/stevemao/left-pad.git",
              },
            });
          }
          return new Response("nope", { status: 429 });
        },
      },
    );
    assert.equal(enriched.latest, "1.3.0");
    assert.equal(enriched.githubUrl, "https://github.com/stevemao/left-pad");
    assert.equal(enriched.openIssuesCount, undefined);
  });

  it("degrades empty on npm 404", async () => {
    const enriched = await enrichDependencyRow(
      { name: "missing-pkg", range: "1.0.0" },
      {
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      },
    );
    assert.equal(enriched.latest, undefined);
    assert.equal(enriched.githubUrl, undefined);
    assert.equal(enriched.openIssuesCount, undefined);
    assert.equal(enriched.npmUrl, "https://www.npmjs.com/package/missing-pkg");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
