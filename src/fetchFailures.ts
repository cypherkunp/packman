export type FetchFailureKind = "timeout" | "offline" | "error";

export function parseRetryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return Math.round(seconds * 1000);
}

export function classifyFetchFailure(error: unknown): FetchFailureKind {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "timeout";
  }
  if (error instanceof TypeError) {
    return "offline";
  }
  return "error";
}
