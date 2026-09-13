import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchSocketScoresByPurl,
  parseSocketArtifact,
} from "./fetchSocketScores";

describe("parseSocketArtifact", () => {
  it("maps overall score 0–1 to 0–100 and detects high+ alerts", () => {
    assert.deepEqual(
      parseSocketArtifact({
        purl: "pkg:npm/express@4.19.2",
        score: { overall: 0.92 },
        alerts: [{ severity: "low" }, { severity: "high" }],
      }),
      {
        purl: "pkg:npm/express@4.19.2",
        overall100: 92,
        highSeverity: true,
      },
    );
    assert.deepEqual(
      parseSocketArtifact({
        purl: "pkg:npm/left-pad@1.3.0",
        score: { overall: 1 },
        alerts: [{ severity: "middle" }],
      }),
      {
        purl: "pkg:npm/left-pad@1.3.0",
        overall100: 100,
        highSeverity: false,
      },
    );
  });

  it("returns null when score is missing", () => {
    assert.equal(parseSocketArtifact({ purl: "pkg:npm/x@1" }), null);
  });
});

describe("fetchSocketScoresByPurl", () => {
  it("POSTs org-scoped PURL batch with alerts and auth", async () => {
    const result = await fetchSocketScoresByPurl(
      {
        orgSlug: "acme",
        apiToken: "sekret",
        components: [{ purl: "pkg:npm/express@4.19.2" }],
      },
      async (url, init) => {
        assert.equal(
          url,
          "https://api.socket.dev/v0/orgs/acme/purl?alerts=true",
        );
        assert.equal(init?.method, "POST");
        assert.equal(
          (init?.headers as Record<string, string>).Authorization,
          "Bearer sekret",
        );
        assert.deepEqual(JSON.parse(String(init?.body)), {
          components: [{ purl: "pkg:npm/express@4.19.2" }],
        });
        return jsonResponse([
          {
            purl: "pkg:npm/express@4.19.2",
            score: { overall: 0.87 },
            alerts: [{ severity: "critical" }],
          },
        ]);
      },
    );

    assert.equal(result.status, "ok");
    if (result.status === "ok") {
      assert.deepEqual(result.byPurl.get("pkg:npm/express@4.19.2"), {
        purl: "pkg:npm/express@4.19.2",
        overall100: 87,
        highSeverity: true,
      });
    }
  });

  it("degrades on 401/429/network errors", async () => {
    const unauthorized = await fetchSocketScoresByPurl(
      {
        orgSlug: "acme",
        apiToken: "bad",
        components: [{ purl: "pkg:npm/x@1" }],
      },
      async () => new Response("nope", { status: 401 }),
    );
    assert.equal(unauthorized.status, "error");

    const limited = await fetchSocketScoresByPurl(
      {
        orgSlug: "acme",
        apiToken: "tok",
        components: [{ purl: "pkg:npm/x@1" }],
      },
      async () => new Response("slow down", { status: 429 }),
    );
    assert.equal(limited.status, "error");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
