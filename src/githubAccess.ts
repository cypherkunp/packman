import {
  GITHUB_SCOPES,
  resolveGithubToken,
  type GithubSession,
} from "./resolveGithubToken";

/**
 * Whether Packman can make GitHub requests as an account: `unknown` until a
 * token has been resolved once, then `granted` or `none`.
 */
export type GithubAccessStatus = "unknown" | "granted" | "none";

export type GithubAccessOptions = {
  /** `packman.github.token`, the advanced override. */
  configuredToken: () => string | undefined;
  /**
   * The editor's GitHub session. `interactive: false` must never prompt
   * (VS Code `silent: true`); `interactive: true` shows the editor's own
   * consent prompt (`createIfNone: true`).
   */
  getSession: (
    scopes: readonly string[],
    options: { interactive: boolean },
  ) => PromiseLike<GithubSession | undefined>;
  /** A sign-in click was granted: re-fetch GitHub data for visible editors. */
  onGranted: () => void;
  /** Whether Packman has access changed: re-render. */
  onChange: () => void;
};

/**
 * GitHub access with no setup (ADR 0002): the token setting, else the
 * editor's signed-in account, else unauthenticated. Only a sign-in click
 * ever asks interactively.
 */
export class GithubAccess {
  private access: GithubAccessStatus = "unknown";
  private signingIn: Promise<void> | undefined;

  constructor(private readonly options: GithubAccessOptions) {}

  get status(): GithubAccessStatus {
    return this.access;
  }

  /** The token for GitHub requests, resolved silently. */
  async token(): Promise<string | undefined> {
    const token = await resolveGithubToken(
      this.options.configuredToken(),
      (scopes) => this.options.getSession(scopes, { interactive: false }),
    );
    this.record(token !== undefined ? "granted" : "none");
    return token;
  }

  /**
   * The Block summary's sign-in action: one interactive request per click
   * (concurrent clicks share it). A granted session re-fetches once.
   */
  signIn(): Promise<void> {
    this.signingIn ??= this.requestInteractively().finally(() => {
      this.signingIn = undefined;
    });
    return this.signingIn;
  }

  /**
   * The editor's GitHub sessions changed from elsewhere (the Accounts menu,
   * another extension). This only updates access for the next user-driven
   * fetch and re-renders; it never fetches (ADR 0002).
   */
  async sessionsChanged(): Promise<void> {
    await this.token();
  }

  private async requestInteractively(): Promise<void> {
    let session: GithubSession | undefined;
    try {
      session = await this.options.getSession(GITHUB_SCOPES, {
        interactive: true,
      });
    } catch {
      return;
    }
    if (!session?.accessToken?.trim() || this.access === "granted") {
      return;
    }
    this.record("granted");
    this.options.onGranted();
  }

  private record(access: GithubAccessStatus): void {
    if (access !== this.access) {
      this.access = access;
      this.options.onChange();
    }
  }
}
