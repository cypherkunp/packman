import {
  enrichDependencyEager,
  enrichDependencyGithub,
  githubPart,
  type EnrichedDependencyRow,
} from "./enrichDependencyRow";
import { ENRICHMENT_TTL_MS, type EnrichmentCache } from "./enrichmentCache";
import type { FetchLike } from "./fetchNpmLatest";
import { fetchSocketScoresByPurl } from "./fetchSocketScores";
import type { GithubBudget } from "./githubBudget";
import { ENRICHMENT_CONCURRENCY, mapPool } from "./mapPool";
import type { DependencyRow } from "./packageViewModel";
import {
  applySocketEnrichment,
  socketComponentsFromRows,
} from "./socketColumn";
import type { SocketCredentials } from "./socketCredentials";

export type EnrichmentStoreSources = {
  cache: EnrichmentCache<unknown>;
  fetchImpl?: FetchLike;
  /** Clock for entry expiry; entries live as long as the cache TTL. */
  now?: () => number;
  ttlMs?: number;
};

export type EagerEnrichmentOptions = {
  /** Socket is batched in when ready; `missing` marks every row as a CTA. */
  socket?: SocketCredentials;
  signal?: AbortSignal;
  /** Bypass stored and cached results (the Refresh command). */
  forceRefresh?: boolean;
};

export type GithubEnrichmentOptions = {
  githubToken?: string;
  githubBudget?: GithubBudget;
  signal?: AbortSignal;
  forceRefresh?: boolean;
};

/**
 * Process-wide Dependency enrichment, keyed by Dependency name and layered
 * over the EnrichmentCache, so the Overlay, hovers and UI mode share one
 * fetch per package. A changed range never refetches.
 */
export class EnrichmentStore {
  private readonly entries = new Map<string, EnrichedDependencyRow>();
  /** When each entry's eager part was fetched, for expiry. */
  private readonly storedAt = new Map<string, number>();
  private readonly eagerInFlight = new Map<
    string,
    Promise<EnrichedDependencyRow>
  >();
  /** Last degraded eager row per name: not stored, but reused by GitHub. */
  private readonly degraded = new Map<string, EnrichedDependencyRow>();
  /** When each Dependency's GitHub part was loaded, for expiry. */
  private readonly githubLoaded = new Map<string, number>();
  private readonly githubInFlight = new Map<
    string,
    Promise<EnrichedDependencyRow>
  >();

  constructor(private readonly sources: EnrichmentStoreSources) {}

  /** What is already known for a Dependency, with no fetch. */
  peek(row: DependencyRow): EnrichedDependencyRow | undefined {
    const stored = this.entries.get(row.name);
    return stored ? { ...stored, range: row.range } : undefined;
  }

  /**
   * Eager path for a set of Dependencies: npm latest for names not yet known,
   * then one Socket batch when configured. Makes no GitHub requests.
   */
  async enrichEager(
    rows: readonly DependencyRow[],
    options: EagerEnrichmentOptions = {},
  ): Promise<Map<string, EnrichedDependencyRow>> {
    const unique = uniqueByName(rows);
    const signal = options.signal;
    const eager = await mapPool(
      unique,
      ENRICHMENT_CONCURRENCY,
      (row) => this.enrichEagerOne(row, options),
      signal,
    );
    const fetched = eager.filter(
      (row): row is EnrichedDependencyRow => row !== undefined,
    );
    const withSocket = await this.withSocket(fetched, options);
    return new Map(
      unique.flatMap((row) => {
        const hit = withSocket.find((entry) => entry.name === row.name);
        return hit ? [[row.name, { ...hit, range: row.range }] as const] : [];
      }),
    );
  }

  /**
   * GitHub-only path for one Dependency: repo summary and open issues/PRs.
   * Runs the eager npm lookup first only if it isn't known yet. Goes through
   * the GitHub budget and the cache; a blocked budget yields a degraded row.
   */
  async enrichGithub(
    row: DependencyRow,
    options: GithubEnrichmentOptions = {},
  ): Promise<EnrichedDependencyRow> {
    const loaded = this.entries.get(row.name);
    if (
      loaded &&
      this.isFresh(this.githubLoaded.get(row.name)) &&
      !options.forceRefresh
    ) {
      return { ...loaded, range: row.range };
    }
    let pending = this.githubInFlight.get(row.name);
    if (!pending) {
      pending = this.enrichGithubOne(row, options);
      this.githubInFlight.set(row.name, pending);
      const started = pending;
      void started.finally(() => {
        if (this.githubInFlight.get(row.name) === started) {
          this.githubInFlight.delete(row.name);
        }
      });
    }
    const enriched = await pending;
    return { ...enriched, range: row.range };
  }

  /** Forget everything (the refresh command also clears the cache). */
  clear(): void {
    this.entries.clear();
    this.storedAt.clear();
    this.eagerInFlight.clear();
    this.degraded.clear();
    this.githubLoaded.clear();
    this.githubInFlight.clear();
  }

  private async enrichGithubOne(
    row: DependencyRow,
    options: GithubEnrichmentOptions,
  ): Promise<EnrichedDependencyRow> {
    const eager =
      this.degraded.get(row.name) ??
      (await this.enrichEagerOne(row, { signal: options.signal }));
    const enriched = await enrichDependencyGithub(eager, {
      cache: this.sources.cache,
      fetchImpl: this.sources.fetchImpl,
      signal: options.signal,
      forceRefresh: options.forceRefresh,
      githubToken: options.githubToken,
      githubBudget: options.githubBudget,
    });
    const degraded = enriched.githubDegrade || enriched.issuesDegrade;
    const stored = this.entries.get(row.name);
    if (!degraded && stored && !options.signal?.aborted) {
      this.entries.set(row.name, { ...stored, ...githubPart(enriched) });
      this.githubLoaded.set(row.name, this.now());
    }
    return enriched;
  }

  private enrichEagerOne(
    row: DependencyRow,
    options: EagerEnrichmentOptions,
  ): Promise<EnrichedDependencyRow> {
    const signal = options.signal;
    const stored = this.entries.get(row.name);
    if (
      stored &&
      this.isFresh(this.storedAt.get(row.name)) &&
      !options.forceRefresh
    ) {
      return Promise.resolve(stored);
    }
    const pending = this.eagerInFlight.get(row.name);
    if (pending) {
      return pending;
    }
    if (options.forceRefresh) {
      this.githubLoaded.delete(row.name);
    }
    const started = enrichDependencyEager(row, {
      cache: this.sources.cache,
      fetchImpl: this.sources.fetchImpl,
      signal,
      forceRefresh: options.forceRefresh,
    }).then((enriched) => {
      if (this.eagerInFlight.get(row.name) === started) {
        this.eagerInFlight.delete(row.name);
        // Degraded results stay out of the store so the next pass retries.
        if (signal?.aborted) {
          return enriched;
        }
        if (enriched.latestDegrade) {
          this.degraded.set(row.name, enriched);
        } else {
          this.degraded.delete(row.name);
          this.entries.set(row.name, enriched);
          this.storedAt.set(row.name, this.now());
        }
      }
      return enriched;
    });
    this.eagerInFlight.set(row.name, started);
    return started;
  }

  private now(): number {
    return this.sources.now?.() ?? Date.now();
  }

  /** Whether something stored at `at` is still within the cache lifetime. */
  private isFresh(at: number | undefined): boolean {
    if (at === undefined) {
      return false;
    }
    return this.now() - at <= (this.sources.ttlMs ?? ENRICHMENT_TTL_MS);
  }

  private async withSocket(
    rows: EnrichedDependencyRow[],
    options: EagerEnrichmentOptions,
  ): Promise<EnrichedDependencyRow[]> {
    const credentials = options.socket;
    if (!credentials) {
      return rows;
    }
    if (credentials.status === "missing") {
      return applySocketEnrichment(rows, credentials, undefined);
    }
    const settled = rows.filter(
      (row) => row.socket && row.socket.kind !== "cta",
    );
    const unsettled = rows.filter(
      (row) => !row.socket || row.socket.kind === "cta",
    );
    if (unsettled.length === 0) {
      return rows;
    }
    const result = await fetchSocketScoresByPurl(
      {
        orgSlug: credentials.orgSlug,
        apiToken: credentials.apiToken,
        components: socketComponentsFromRows(unsettled),
      },
      this.sources.fetchImpl,
    );
    const scored = applySocketEnrichment(unsettled, credentials, result);
    if (result.status === "ok" && !options.signal?.aborted) {
      for (const row of scored) {
        const stored = this.entries.get(row.name);
        if (stored) {
          this.entries.set(row.name, { ...stored, socket: row.socket });
        }
      }
    }
    return [...settled, ...scored];
  }
}

function uniqueByName(rows: readonly DependencyRow[]): DependencyRow[] {
  return [...new Map(rows.map((row) => [row.name, row])).values()];
}
