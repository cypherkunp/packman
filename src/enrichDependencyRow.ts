import type { DependencyRow } from "./packageViewModel";
import { fetchGithubRepoSummary } from "./fetchGithubRepoSummary";
import { fetchNpmLatest, npmPackageUrl, type FetchLike } from "./fetchNpmLatest";
import { normalizeGithubRepo } from "./normalizeGithubRepo";
import type { SocketColumn } from "./socketColumn";

export type EnrichedDependencyRow = DependencyRow & {
  npmUrl: string;
  latest?: string;
  githubUrl?: string;
  issuesUrl?: string;
  openIssuesCount?: number;
  socket?: SocketColumn;
};

export type EnrichmentOptions = {
  githubToken?: string;
  fetchImpl?: FetchLike;
};

export async function enrichDependencyRow(
  row: DependencyRow,
  options: EnrichmentOptions = {},
): Promise<EnrichedDependencyRow> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base: EnrichedDependencyRow = {
    ...row,
    npmUrl: npmPackageUrl(row.name),
  };

  const npm = await fetchNpmLatest(row.name, fetchImpl);
  if (npm.status !== "ok") {
    return base;
  }

  base.latest = npm.version;
  const ownerRepo = normalizeGithubRepo(npm.repository, npm.bugsUrl);
  if (!ownerRepo) {
    return base;
  }

  // Prefer canonical GitHub URL even before/without API success.
  base.githubUrl = `https://github.com/${ownerRepo}`;
  base.issuesUrl = `${base.githubUrl}/issues`;

  const github = await fetchGithubRepoSummary(
    ownerRepo,
    options.githubToken,
    fetchImpl,
  );
  if (github.status === "ok") {
    base.githubUrl = github.htmlUrl;
    base.issuesUrl = `${github.htmlUrl}/issues`;
    base.openIssuesCount = github.openIssuesCount;
  }

  return base;
}
