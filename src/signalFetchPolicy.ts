import {
  overlayDependenciesVisibleFirst,
  type DependencyEnrichment,
  type OverlayLineRange,
} from "./buildOverlay";
import {
  githubPart,
  type DependencyGithub,
  type EnrichedDependency,
} from "./enrichDependencyRow";
import type { EnrichmentStore } from "./enrichmentStore";
import { npmPackageUrl } from "./fetchNpmLatest";
import type { GithubBudget } from "./githubBudget";
import { ENRICHMENT_CONCURRENCY, mapPool } from "./mapPool";
import type { Dependency } from "./overlayTree";
import type { SocketCredentials } from "./socketCredentials";

/** A `package.json` editor as the fetch policy sees it. */
export type ShownDocument = {
  text: string;
  /** Lines on screen; their Dependencies are fetched first. */
  visibleRanges?: readonly OverlayLineRange[];
};

export type SignalFetchPolicyOptions = {
  store: EnrichmentStore;
  budget: GithubBudget;
  now?: () => number;
  socket: () => SocketCredentials;
  githubToken: () => Promise<string | undefined>;
  /** Called whenever the enrichment state changed. */
  onChange: () => void;
};

/**
 * When Dependency signals are fetched (ADR 0002): strictly user-driven.
 */
export class SignalFetchPolicy {
  private readonly enrichmentByName = new Map<string, DependencyEnrichment>();
  private readonly githubByName = new Map<string, DependencyGithub>();
  /** Names this policy has fetched (or is fetching), so edits don't refetch. */
  private readonly requested = new Set<string>();
  private abort = new AbortController();

  constructor(private readonly options: SignalFetchPolicyOptions) {}

  /** Eager enrichment (npm, Socket) per Dependency name. */
  get enrichment(): ReadonlyMap<string, DependencyEnrichment> {
    return this.enrichmentByName;
  }

  /**
   * GitHub enrichment per Dependency name: open issues + PRs count, or
   * `issuesDegrade: "rate_limited"` when the budget paused it.
   */
  get github(): ReadonlyMap<string, DependencyGithub> {
    return this.githubByName;
  }

  /**
   * The shared GitHub budget is blocked. Nothing retries when it resumes:
   * paused Dependencies wait for the next show, edit or Refresh.
   */
  get githubPaused(): boolean {
    return this.options.budget.blockedUntilMs() !== undefined;
  }

  /** `package.json` editors became visible. */
  async shown(documents: readonly ShownDocument[]): Promise<void> {
    await this.fetch(rowsOf(documents));
  }

  /**
   * A `package.json` was edited (after the debounce): only Dependency names
   * never fetched before are fetched. Expired or failed ones wait until the
   * file is shown again, or Refresh.
   */
  async edited(document: ShownDocument): Promise<void> {
    const rows = overlayDependenciesVisibleFirst(
      document.text,
      document.visibleRanges,
    ).filter((row) => !this.requested.has(row.name));
    await this.fetch(rows);
  }

  /**
   * Refresh: forget everything and fetch again, for the given (visible)
   * editors only. Others refetch when they are shown next.
   */
  async refresh(documents: readonly ShownDocument[]): Promise<void> {
    this.reset();
    await this.fetch(rowsOf(documents), { forceRefresh: true });
  }

  /**
   * Socket settings changed: re-fetch Socket scores for the given (visible)
   * editors only. npm and GitHub results stay.
   */
  async socketChanged(documents: readonly ShownDocument[]): Promise<void> {
    const rows = uniqueByName(rowsOf(documents));
    if (rows.length === 0) {
      return;
    }
    const signal = this.abort.signal;
    const eager = await this.options.store.enrichEager(rows, {
      signal,
      socket: this.options.socket(),
      forceSocket: true,
    });
    if (signal.aborted) {
      return;
    }
    for (const [name, row] of eager) {
      this.enrichmentByName.set(name, enrichmentOf(row));
    }
    this.options.onChange();
  }

  /**
   * A sign-in click was granted: re-fetch only GitHub data, with the new
   * access, for the given (visible) editors. npm and Socket results stay.
   */
  async signedIn(documents: readonly ShownDocument[]): Promise<void> {
    const rows = uniqueByName(rowsOf(documents));
    if (rows.length === 0) {
      return;
    }
    for (const row of rows) {
      this.requested.add(row.name);
    }
    const signal = this.abort.signal;
    const githubToken = await this.options.githubToken();
    this.options.budget.setIdentity(githubToken);
    await mapPool(
      rows,
      ENRICHMENT_CONCURRENCY,
      (row) =>
        this.loadGithub(row, { githubToken, signal, forceRefresh: true }),
      signal,
    );
  }

  /**
   * A Dependency's details are hovered. They read what was already fetched,
   * degraded or paused results included; only a Dependency never fetched
   * gets its GitHub request here.
   */
  async hover(row: Dependency): Promise<void> {
    if (this.githubByName.has(row.name)) {
      return;
    }
    this.requested.add(row.name);
    const signal = this.abort.signal;
    const githubToken = await this.options.githubToken();
    this.options.budget.setIdentity(githubToken);
    await this.loadGithub(row, { githubToken, signal });
  }

  /** Stop in-flight work; stale results never land. */
  dispose(): void {
    this.abort.abort();
  }

  private reset(): void {
    this.abort.abort();
    this.abort = new AbortController();
    this.enrichmentByName.clear();
    this.githubByName.clear();
    this.requested.clear();
    this.options.onChange();
  }

  private async fetch(
    rows: readonly Dependency[],
    options: { forceRefresh?: boolean } = {},
  ): Promise<void> {
    const ordered = uniqueByName(rows);
    if (ordered.length === 0) {
      return;
    }
    for (const row of ordered) {
      this.requested.add(row.name);
    }
    const signal = this.abort.signal;
    const eager = await this.options.store.enrichEager(ordered, {
      signal,
      socket: this.options.socket(),
      forceRefresh: options.forceRefresh,
    });
    if (signal.aborted) {
      return;
    }
    for (const [name, row] of eager) {
      this.enrichmentByName.set(name, enrichmentOf(row));
    }
    this.options.onChange();

    const githubToken = await this.options.githubToken();
    this.options.budget.setIdentity(githubToken);
    await mapPool(
      ordered,
      ENRICHMENT_CONCURRENCY,
      (row) =>
        this.loadGithub(row, {
          githubToken,
          signal,
          forceRefresh: options.forceRefresh,
        }),
      signal,
    );
  }

  /** One GitHub request through the budget; paused, with none, once blocked. */
  private async loadGithub(
    row: Dependency,
    options: {
      githubToken: string | undefined;
      signal: AbortSignal;
      forceRefresh?: boolean;
    },
  ): Promise<void> {
    const enriched = this.githubPaused
      ? pausedRow(this.options.store, row)
      : await this.options.store.enrichGithub(row, {
          ...options,
          githubBudget: this.options.budget,
        });
    if (options.signal.aborted) {
      return;
    }
    this.githubByName.set(row.name, githubPart(enriched));
    this.enrichmentByName.set(row.name, enrichmentOf(enriched));
    this.options.onChange();
  }
}

function rowsOf(documents: readonly ShownDocument[]): Dependency[] {
  return documents.flatMap((document) =>
    overlayDependenciesVisibleFirst(document.text, document.visibleRanges),
  );
}

function pausedRow(
  store: EnrichmentStore,
  row: Dependency,
): EnrichedDependency {
  const known = store.peek(row) ?? { ...row, npmUrl: npmPackageUrl(row.name) };
  return known.openIssuesCount === undefined && known.githubRepo
    ? { ...known, issuesDegrade: "rate_limited" }
    : known;
}

function enrichmentOf(row: EnrichedDependency): DependencyEnrichment {
  const enrichment: DependencyEnrichment = {};
  if (row.latest !== undefined) {
    enrichment.latest = row.latest;
  }
  if (row.latestDegrade !== undefined) {
    enrichment.latestDegrade = row.latestDegrade;
  }
  if (row.socket !== undefined) {
    enrichment.socket = row.socket;
  }
  return enrichment;
}

function uniqueByName(rows: readonly Dependency[]): Dependency[] {
  return [...new Map(rows.map((row) => [row.name, row])).values()];
}
