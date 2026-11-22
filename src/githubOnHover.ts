import type { DependencyGithub } from "./enrichDependencyRow";

/**
 * Whether a hover should fetch a Dependency's GitHub data, given what the
 * Overlay already holds for it. Degraded data is shown as is: offline and
 * timed-out results wait for Refresh (which drops them), and rate-limited
 * ones are retried only once the shared budget is no longer blocked.
 */
export function shouldFetchGithubOnHover(
  cached: DependencyGithub | undefined,
  githubPaused: boolean,
): boolean {
  if (!cached) {
    return true;
  }
  const degrades = [cached.githubDegrade, cached.issuesDegrade];
  if (degrades.includes("rate_limited")) {
    return !githubPaused;
  }
  return false;
}
