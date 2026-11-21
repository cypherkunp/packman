import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveGithubToken } from "./resolveGithubToken";

describe("resolveGithubToken", () => {
  it("prefers a configured token over the editor session", async () => {
    const token = await resolveGithubToken("  pat-123  ", async () => ({
      accessToken: "session",
    }));
    assert.equal(token, "pat-123");
  });

  it("uses the editor session when no token is configured", async () => {
    const seen: string[][] = [];
    const token = await resolveGithubToken("  ", async (scopes) => {
      seen.push([...scopes]);
      return { accessToken: " session-token " };
    });
    assert.equal(token, "session-token");
    assert.deepEqual(seen, [["read:user"]]);
  });

  it("returns undefined when GitHub auth is unavailable", async () => {
    assert.equal(await resolveGithubToken(undefined), undefined);
    assert.equal(
      await resolveGithubToken("", async () => {
        throw new Error("no github provider");
      }),
      undefined,
    );
  });
});
