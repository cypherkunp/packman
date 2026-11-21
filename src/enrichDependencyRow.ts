import type { EnrichmentCache } from "./enrichmentCache";
import { enrichmentCacheKey } from "./enrichmentCache";
import type { DependencyRow } from "./packageViewModel";
import { fetchGithubRepoSummary } from "./fetchGithubRepoSummary";
import {
  fetchNpmLatest,
  npmPackageUrl,
  type FetchLike,
  type NpmLatestResult,
} from "./fetchNpmLatest";
import type { GithubBudget } from "./githubBudget";
import { normalizeGithubRepo } from "./normalizeGithubRepo";
import type { SocketColumn } from "./socketColumn";

export type CellDegrade = "rate_limited" | "offline" | "timeout";

export type EnrichedDependencyRow = DependencyRow & {
  npmUrl: string;
  latest?: string;
  /** `owner/repo` from npm metadata; the GitHub-only path needs it. */
  githubRepo?: string;
  githubUrl?: string;
  issuesUrl?: string;
  openIssuesCount?: number;
  socket?: SocketColumn;
  latestDegrade?: CellDegrade;
  githubDegrade?: CellDegrade;
  /** Set when the repo link is known but the issues count could not be loaded. */
  issuesDegrade?: CellDegrade;
};

/** The GitHub-only part of a Dependency's enrichment. */
export type DependencyGithub = Pick<
  EnrichedDependencyRow,
  | "githubUrl"
  | "issuesUrl"
  | "openIssuesCount"
  | "githubDegrade"
  | "issuesDegrade"
>;

const GITHUB_FIELDS = [
  "githubUrl",
  "issuesUrl",
  "openIssuesCount",
  "githubDegrade",
  "issuesDegrade",
] as const satisfies readonly (keyof DependencyGithub)[];

/** The GitHub fields a row has set, and no others. */
export function githubPart(row: DependencyGithub): DependencyGithub {
  const part: Record<string, unknown> = {};
  for (const field of GITHUB_FIELDS) {
    if (row[field] !== undefined) {
      part[field] = row[field];
    }
  }
  return part as DependencyGithub;
}

export type EnrichmentOptions = {
  githubToken?: string;
  fetchImpl?: FetchLike;
  cache?: EnrichmentCache<unknown>;
  signal?: AbortSignal;
  forceRefresh?: boolean;
  githubBudget?: GithubBudget;
};

type GithubCache = Awaited<ReturnType<typeof fetchGithubRepoSummary>>;

/**
 * Full enrichment: the eager path followed by the GitHub-only path.
 * UI mode uses this to keep its eager behaviour.
 */
export async function enrichDependencyRow(
  row: DependencyRow,
  options: EnrichmentOptions = {},
): Promise<EnrichedDependencyRow> {
  const eager = await enrichDependencyEager(row, options);
  return enrichDependencyGithub(eager, options);
}

/**
 * Eager path: npm latest (and the repo link npm declares). Never calls GitHub,
 * so it is cheap enough to run whenever a package.json opens.
 */
export async function enrichDependencyEager(
  row: DependencyRow,
  options: EnrichmentOptions = {},
): Promise<EnrichedDependencyRow> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache;
  const init = options.signal ? { signal: options.signal } : undefined;
  const base: EnrichedDependencyRow = {
    ...row,
    npmUrl: npmPackageUrl(row.name),
  };

  const npmKey = enrichmentCacheKey("npm", row.name);
  if (cache?.getBlock(npmKey)) {
    base.latestDegrade = "rate_limited";
    applyNpmOk(base, peekOkNpm(cache, npmKey));
    return base;
  }

  const cachedNpm = peekCache<NpmLatestResult>(cache, npmKey);
  let npm: NpmLatestResult | undefined =
    !options.forceRefresh && cachedNpm && !cachedNpm.stale
      ? cachedNpm.value
      : undefined;

  if (!npm) {
    npm = await fetchNpmLatest(row.name, fetchImpl, init);
    if (npm.status === "ok" || npm.status === "not_found") {
      cache?.set(npmKey, npm);
    } else if (npm.status === "rate_limited") {
      rememberBlock(cache, npmKey, npm.retryAfterMs);
      base.latestDegrade = "rate_limited";
      applyNpmOk(base, peekOkNpm(cache, npmKey));
      return base;
    } else if (npm.status === "offline" || npm.status === "timeout") {
      base.latestDegrade = npm.status;
      applyNpmOk(base, peekOkNpm(cache, npmKey));
      return base;
    }
  }

  if (npm.status === "ok") {
    applyNpmOk(base, npm);
  }
  return base;
}

/**
 * GitHub-only path: repo summary and open issues/PRs for one Dependency whose
 * eager enrichment found a GitHub repo. Goes through the GitHub budget and
 * the enrichment cache; never calls npm.
 */
export async function enrichDependencyGithub(
  eager: EnrichedDependencyRow,
  options: EnrichmentOptions = {},
): Promise<EnrichedDependencyRow> {
  const base: EnrichedDependencyRow = { ...eager };
  const ownerRepo = base.githubRepo;
  if (!ownerRepo) {
    return base;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache;
  const init = options.signal ? { signal: options.signal } : undefined;

  const githubKey = enrichmentCacheKey("github", ownerRepo);
  if (cache?.getBlock(githubKey)) {
    applyRateLimitedGithub(base, cache, githubKey);
    return base;
  }

  const cachedGithub = peekCache<GithubCache>(cache, githubKey);
  let github: GithubCache | undefined =
    !options.forceRefresh && cachedGithub && !cachedGithub.stale
      ? cachedGithub.value
      : undefined;

  if (!github) {
    github = await fetchGithubRepoSummary(
      ownerRepo,
      options.githubToken,
      fetchImpl,
      init,
      options.githubBudget,
    );
    if (github.status === "ok" || github.status === "not_found") {
      cache?.set(githubKey, github);
    } else if (github.status === "rate_limited") {
      rememberBlock(cache, githubKey, github.retryAfterMs);
      applyRateLimitedGithub(base, cache, githubKey);
      return base;
    } else if (github.status === "offline" || github.status === "timeout") {
      base.githubDegrade = github.status;
      applyGithubOk(base, peekOkGithub(cache, githubKey));
      return base;
    }
  }

  if (github.status === "ok") {
    applyGithubOk(base, github);
  }
  return base;
}

function peekCache<T>(
  cache: EnrichmentCache<unknown> | undefined,
  key: string,
): { value: T; stale: boolean } | undefined {
  const hit = cache?.get(key);
  if (!hit) {
    return undefined;
  }
  return { value: hit.value as T, stale: hit.stale };
}

function peekOkNpm(
  cache: EnrichmentCache<unknown> | undefined,
  key: string,
): Extract<NpmLatestResult, { status: "ok" }> | undefined {
  const hit = peekCache<NpmLatestResult>(cache, key);
  return hit?.value.status === "ok" ? hit.value : undefined;
}

function peekOkGithub(
  cache: EnrichmentCache<unknown> | undefined,
  key: string,
): Extract<GithubCache, { status: "ok" }> | undefined {
  const hit = peekCache<GithubCache>(cache, key);
  return hit?.value.status === "ok" ? hit.value : undefined;
}

function applyNpmOk(
  base: EnrichedDependencyRow,
  npm: Extract<NpmLatestResult, { status: "ok" }> | undefined,
): void {
  if (!npm) {
    return;
  }
  base.latest = npm.version;
  const ownerRepo = normalizeGithubRepo(npm.repository, npm.bugsUrl);
  if (ownerRepo) {
    base.githubRepo = ownerRepo;
    base.githubUrl = `https://github.com/${ownerRepo}`;
    base.issuesUrl = `${base.githubUrl}/issues`;
  }
}

function applyRateLimitedGithub(
  base: EnrichedDependencyRow,
  cache: EnrichmentCache<unknown> | undefined,
  githubKey: string,
): void {
  const cached = peekOkGithub(cache, githubKey);
  applyGithubOk(base, cached);
  if (!cached) {
    base.issuesDegrade = "rate_limited";
  }
}

function applyGithubOk(
  base: EnrichedDependencyRow,
  github: Extract<GithubCache, { status: "ok" }> | undefined,
): void {
  if (!github) {
    return;
  }
  base.githubUrl = github.htmlUrl;
  base.issuesUrl = `${github.htmlUrl}/issues`;
  base.openIssuesCount = github.openIssuesCount;
}

function rememberBlock(
  cache: EnrichmentCache<unknown> | undefined,
  key: string,
  retryAfterMs: number | undefined,
): void {
  if (!cache) {
    return;
  }
  const wait = retryAfterMs ?? 60_000;
  cache.blockUntil(key, Date.now() + wait);
}
