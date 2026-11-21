/**
 * The Refresh signal for Dependency enrichment. It owns the clear: shared
 * enrichment is dropped exactly once, before any surface (UI mode, the
 * Overlay) is told to refetch, so no surface clears away another's
 * in-flight results.
 */
export class EnrichmentRefresh {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly clearShared: () => void) {}

  onRefresh(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  refresh(): void {
    this.clearShared();
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}
