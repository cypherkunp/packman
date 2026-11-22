import { EnrichmentCache, ENRICHMENT_TTL_MS } from "./enrichmentCache";
import { EnrichmentRefresh } from "./enrichmentRefresh";
import { EnrichmentStore } from "./enrichmentStore";

/**
 * Process-wide state shared by the Overlay's surfaces for the extension
 * host's lifetime.
 */

export const enrichmentCache = new EnrichmentCache<unknown>({
  ttlMs: ENRICHMENT_TTL_MS,
});

/** Dependency enrichment keyed by name, so no package is fetched twice. */
export const enrichmentStore = new EnrichmentStore({ cache: enrichmentCache });

/** Refresh: clears the cache and store once, then tells every surface. */
export const enrichmentRefresh = new EnrichmentRefresh(() => {
  enrichmentCache.clear();
  enrichmentStore.clear();
});

/** Package dirs already warned about the npm fallback (session-scoped). */
export const scriptFallbackWarnedDirs = new Set<string>();
