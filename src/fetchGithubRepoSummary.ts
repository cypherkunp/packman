import type { FetchLike } from "./fetchNpmLatest";
import { classifyFetchFailure, requestSignal } from "./fetchFailures";
import {
  type GithubBudget,
  githubRetryAfterMs,
  isGithubRateLimitResponse,
} from "./githubBudget";

export type GithubRepoSummary =
  | {
      status: "ok";
      htmlUrl: string;
      openIssuesCount: number;
    }
  | { status: "not_found" }
  | { status: "rate_limited"; retryAfterMs?: number }
  | { status: "offline" }
  | { status: "timeout" }
  | { status: "error"; message: string };

const GITHUB_API_VERSION = "2022-11-28";

export function githubRequestHeaders(
  token: string | undefined,
  extra?: RequestInit["headers"],
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "packman-vscode",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  if (extra instanceof Headers) {
    extra.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      headers[key] = value;
    }
  } else if (extra) {
    Object.assign(headers, extra);
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function fetchGithubRepoSummary(
  ownerRepo: string,
  token: string | undefined,
  fetchImpl: FetchLike = fetch,
  init?: RequestInit,
  budget?: GithubBudget,
): Promise<GithubRepoSummary> {
  if (init?.signal?.aborted) {
    return { status: "timeout" };
  }

  const slot = budget ? await budget.acquire() : undefined;
  if (slot && !slot.ok) {
    return { status: "rate_limited", retryAfterMs: slot.retryAfterMs };
  }
  if (init?.signal?.aborted) {
    if (slot?.ok) {
      slot.release();
      budget?.refund(slot.epoch);
    }
    return { status: "timeout" };
  }

  const url = `https://api.github.com/repos/${ownerRepo}`;
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: githubRequestHeaders(token, init?.headers),
      signal: requestSignal(init?.signal),
    });
    if (response.status === 404) {
      if (slot?.ok) {
        budget?.observe(response.status, response.headers, undefined, slot.epoch);
      }
      return { status: "not_found" };
    }
    if (response.status === 403 || response.status === 429) {
      const body = await response.text();
      if (slot?.ok) {
        budget?.observe(response.status, response.headers, body, slot.epoch);
      }
      if (isGithubRateLimitResponse(response.status, response.headers, body)) {
        return {
          status: "rate_limited",
          retryAfterMs: githubRetryAfterMs(response.headers),
        };
      }
      return { status: "error", message: `GitHub HTTP ${response.status}` };
    }
    if (slot?.ok) {
      budget?.observe(response.status, response.headers, undefined, slot.epoch);
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
    const kind = classifyFetchFailure(error);
    if (kind === "offline" || kind === "timeout") {
      return { status: kind };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "GitHub fetch failed",
    };
  } finally {
    if (slot?.ok) {
      slot.release();
    }
  }
}
