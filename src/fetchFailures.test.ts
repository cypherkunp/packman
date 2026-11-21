import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyFetchFailure,
  parseRetryAfterMs,
} from "./fetchFailures";

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds Retry-After", () => {
    assert.equal(parseRetryAfterMs(new Headers({ "retry-after": "120" })), 120_000);
  });

  it("returns undefined when missing/invalid", () => {
    assert.equal(parseRetryAfterMs(new Headers()), undefined);
    assert.equal(parseRetryAfterMs(new Headers({ "retry-after": "nope" })), undefined);
  });

  it("parses an HTTP-date Retry-After", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const ms = parseRetryAfterMs(
      new Headers({ "retry-after": "Thu, 01 Jan 2026 00:01:00 GMT" }),
      now,
    );
    assert.equal(ms, 60_000);
  });
});

describe("classifyFetchFailure", () => {
  it("classifies abort as timeout and network as offline", () => {
    assert.equal(classifyFetchFailure(new DOMException("aborted", "AbortError")), "timeout");
    assert.equal(classifyFetchFailure(new TypeError("fetch failed")), "offline");
    assert.equal(classifyFetchFailure(new Error("boom")), "error");
  });
});
