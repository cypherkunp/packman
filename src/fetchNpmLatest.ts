import {
  classifyFetchFailure,
  parseRetryAfterMs,
} from "./fetchFailures";

export type NpmLatestResult =
  | {
      status: "ok";
      version: string;
      repository: unknown;
      bugsUrl: unknown;
    }
  | { status: "not_found" }
  | { status: "rate_limited"; retryAfterMs?: number }
  | { status: "offline" }
  | { status: "timeout" }
  | { status: "error"; message: string };

export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchNpmLatest(
  packageName: string,
  fetchImpl: FetchLike = fetch,
  init?: RequestInit,
): Promise<NpmLatestResult> {
  const encoded = encodeNpmPackageName(packageName);
  const url = `https://registry.npmjs.org/${encoded}/latest`;
  try {
    const response = await fetchImpl(url, init);
    if (response.status === 404) {
      return { status: "not_found" };
    }
    if (response.status === 429 || response.status === 403) {
      return {
        status: "rate_limited",
        retryAfterMs: parseRetryAfterMs(response.headers),
      };
    }
    if (!response.ok) {
      return {
        status: "error",
        message: `npm registry HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as {
      version?: unknown;
      repository?: unknown;
      bugs?: { url?: unknown };
    };
    if (typeof body.version !== "string") {
      return { status: "error", message: "npm latest missing version" };
    }
    return {
      status: "ok",
      version: body.version,
      repository: body.repository,
      bugsUrl: body.bugs?.url,
    };
  } catch (error) {
    const kind = classifyFetchFailure(error);
    if (kind === "offline" || kind === "timeout") {
      return { status: kind };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "npm fetch failed",
    };
  }
}

export function encodeNpmPackageName(packageName: string): string {
  if (packageName.startsWith("@")) {
    const slash = packageName.indexOf("/");
    if (slash !== -1) {
      return `${packageName.slice(0, slash)}%2F${packageName.slice(slash + 1)}`;
    }
  }
  return encodeURIComponent(packageName);
}

export function npmPackageUrl(packageName: string): string {
  return `https://www.npmjs.com/package/${packageName}`;
}
