import type { FetchLike } from "./fetchNpmLatest";

export type GithubRepoSummary =
  | {
      status: "ok";
      htmlUrl: string;
      openIssuesCount: number;
    }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };

export async function fetchGithubRepoSummary(
  ownerRepo: string,
  token: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<GithubRepoSummary> {
  const url = `https://api.github.com/repos/${ownerRepo}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "packman-vscode",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetchImpl(url, { headers });
    if (response.status === 404) {
      return { status: "not_found" };
    }
    if (response.status === 403 || response.status === 429) {
      return { status: "rate_limited" };
    }
    if (!response.ok) {
      return {
        status: "error",
        message: `GitHub HTTP ${response.status}`,
      };
    }
    const body = (await response.json()) as {
      html_url?: unknown;
      open_issues_count?: unknown;
    };
    if (
      typeof body.html_url !== "string" ||
      typeof body.open_issues_count !== "number"
    ) {
      return { status: "error", message: "GitHub repo payload incomplete" };
    }
    return {
      status: "ok",
      htmlUrl: body.html_url,
      openIssuesCount: body.open_issues_count,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "GitHub fetch failed",
    };
  }
}
