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
import { normalizeGithubRepo } from "./normalizeGithubRepo";
import type { SocketColumn } from "./socketColumn";

export type CellDegrade = "rate_limited" | "offline" | "timeout";

export type EnrichedDependencyRow = DependencyRow & {
  npmUrl: string;
  latest?: string;
  githubUrl?: string;
  issuesUrl?: string;
  openIssuesCount?: number;
  socket?: SocketColumn;
  latestDegrade?: CellDegrade;
  githubDegrade?: CellDegrade;
};

export type EnrichmentOptions = {
  githubToken?: string;
  fetchImpl?: FetchLike;
  cache?: EnrichmentCache<unknown>;
  signal?: AbortSignal;
  forceRefresh?: boolean;
};

type GithubCache = Awaited<ReturnType<typeof fetchGithubRepoSummary>>;

export async function enrichDependencyRow(
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
      const stale = peekOkNpm(cache, npmKey);
      if (stale) {
        applyNpmOk(base, stale);
        return continueGithub(base, stale, options, fetchImpl, init, cache);
      }
      return base;
    }
  }

  if (npm.status !== "ok") {
    return base;
  }

  applyNpmOk(base, npm);
  return continueGithub(base, npm, options, fetchImpl, init, cache);
}

async function continueGithub(
  base: EnrichedDependencyRow,
  npm: Extract<NpmLatestResult, { status: "ok" }>,
  options: EnrichmentOptions,
  fetchImpl: FetchLike,
  init: RequestInit | undefined,
  cache: EnrichmentCache<unknown> | undefined,
): Promise<EnrichedDependencyRow> {
  const ownerRepo = normalizeGithubRepo(npm.repository, npm.bugsUrl);
  if (!ownerRepo) {
    return base;
  }

  base.githubUrl = `https://github.com/${ownerRepo}`;
  base.issuesUrl = `${base.githubUrl}/issues`;

  const githubKey = enrichmentCacheKey("github", ownerRepo);
  if (cache?.getBlock(githubKey)) {
    base.githubDegrade = "rate_limited";
    applyGithubOk(base, peekOkGithub(cache, githubKey));
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
    );
    if (github.status === "ok" || github.status === "not_found") {
      cache?.set(githubKey, github);
    } else if (github.status === "rate_limited") {
      rememberBlock(cache, githubKey, github.retryAfterMs);
      base.githubDegrade = "rate_limited";
      applyGithubOk(base, peekOkGithub(cache, githubKey));
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
