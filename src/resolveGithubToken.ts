export type GithubSession = {
  accessToken: string;
};

export type GithubSessionLookup = (
  scopes: readonly string[],
) => PromiseLike<GithubSession | undefined>;

/** Enough for public repo metadata; the sign-in asks for the same scopes. */
export const GITHUB_SCOPES: readonly string[] = ["read:user"];

/**
 * Settings PAT wins. Otherwise the GitHub account already signed in to the
 * editor (`read:user` is enough for public repo metadata; VS Code shows an
 * Accounts badge instead of a modal when access has not been granted).
 */
export async function resolveGithubToken(
  configured: string | undefined,
  getSession?: GithubSessionLookup,
): Promise<string | undefined> {
  const trimmed = configured?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (!getSession) {
    return undefined;
  }
  try {
    const session = await getSession(GITHUB_SCOPES);
    const token = session?.accessToken?.trim();
    return token ? token : undefined;
  } catch {
    return undefined;
  }
}
