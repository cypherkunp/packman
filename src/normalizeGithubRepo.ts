export function normalizeGithubRepo(
  repository: unknown,
  bugsUrl?: unknown,
): string | null {
  const fromRepo = extractFromRepository(repository);
  if (fromRepo) {
    return fromRepo;
  }
  if (typeof bugsUrl === "string") {
    return extractOwnerRepoFromUrl(bugsUrl);
  }
  return null;
}

function extractFromRepository(repository: unknown): string | null {
  if (typeof repository === "string") {
    return extractFromString(repository);
  }
  if (
    repository !== null &&
    typeof repository === "object" &&
    "url" in repository &&
    typeof (repository as { url: unknown }).url === "string"
  ) {
    return extractFromString((repository as { url: string }).url);
  }
  return null;
}

function extractFromString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const githubShortcut = /^github:([^/]+)\/([^#]+)$/i.exec(trimmed);
  if (githubShortcut) {
    return `${githubShortcut[1]}/${stripGitSuffix(githubShortcut[2]!)}`;
  }

  if (/^(bitbucket|gitlab|gist):/i.test(trimmed)) {
    return null;
  }

  const bare = /^([^/]+)\/([^/#]+)$/.exec(trimmed);
  if (bare && !trimmed.includes(":")) {
    return `${bare[1]}/${stripGitSuffix(bare[2]!)}`;
  }

  return extractOwnerRepoFromUrl(trimmed);
}

function extractOwnerRepoFromUrl(value: string): string | null {
  const ssh = /(?:git@|ssh:\/\/git@)github\.com[/:]([^/]+)\/([^/#]+)/i.exec(
    value,
  );
  if (ssh) {
    return `${ssh[1]}/${stripGitSuffix(ssh[2]!)}`;
  }

  let url: URL;
  try {
    url = new URL(value.replace(/^git\+/, ""));
  } catch {
    return null;
  }

  if (!/^(www\.)?github\.com$/i.test(url.hostname)) {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return `${parts[0]}/${stripGitSuffix(parts[1]!)}`;
}

function stripGitSuffix(name: string): string {
  return name.replace(/\.git$/i, "");
}
