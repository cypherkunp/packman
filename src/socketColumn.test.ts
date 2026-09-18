import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySocketEnrichment,
  type SocketColumn,
} from "./socketColumn";

describe("applySocketEnrichment", () => {
  it("marks every row as CTA when credentials are missing", () => {
    const rows = applySocketEnrichment(
      [{ name: "express", latest: "4.19.2" }, { name: "lodash", latest: "4.17.21" }],
      { status: "missing" },
      undefined,
    );
    assert.deepEqual(
      rows.map((r) => r.socket),
      [{ kind: "cta" }, { kind: "cta" }] satisfies SocketColumn[],
    );
  });

  it("attaches scores from a successful batch keyed by PURL", () => {
    const byPurl = new Map([
      [
        "pkg:npm/express@4.19.2",
        {
          purl: "pkg:npm/express@4.19.2",
          overall100: 87,
          highSeverity: true,
        },
      ],
    ]);
    const rows = applySocketEnrichment(
      [
        { name: "express", latest: "4.19.2" },
        { name: "left-pad", latest: "1.3.0" },
      ],
      { status: "ready", apiToken: "t", orgSlug: "o" },
      { status: "ok", byPurl },
    );
    assert.deepEqual(rows[0]?.socket, {
      kind: "score",
      overall100: 87,
      highSeverity: true,
      url: "https://socket.dev/npm/package/express",
    });
    assert.deepEqual(rows[1]?.socket, { kind: "empty" });
  });

  it("degrades to empty cells when the Socket API errors", () => {
    const rows = applySocketEnrichment(
      [{ name: "express", latest: "4.19.2" }],
      { status: "ready", apiToken: "t", orgSlug: "o" },
      { status: "error", message: "Socket HTTP 429" },
    );
    assert.deepEqual(rows[0]?.socket, { kind: "empty" });
  });

  it("skips PURL build when latest is unknown", () => {
    const rows = applySocketEnrichment(
      [{ name: "express" }],
      { status: "ready", apiToken: "t", orgSlug: "o" },
      { status: "ok", byPurl: new Map() },
    );
    assert.deepEqual(rows[0]?.socket, { kind: "empty" });
  });
});
