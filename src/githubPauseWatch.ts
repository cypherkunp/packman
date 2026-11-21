export type GithubPauseWatchOptions<T> = {
  /** Whether the shared GitHub budget is blocked right now. */
  isPaused: () => boolean;
  /** Called whenever the paused state flips. */
  onChange: () => void;
  /** A repeating timer, e.g. `setInterval` with the poll period bound. */
  setTimer: (callback: () => void) => T;
  clearTimer: (timer: T) => void;
};

/**
 * Tracks whether GitHub is paused. Callers `check()` whenever the budget may
 * have changed (after a GitHub fetch), so a pause shows at once. A pause has
 * no event for its end, so the watch polls only while paused.
 */
export class GithubPauseWatch<T = unknown> {
  private paused: boolean;
  private timer: T | undefined;

  constructor(private readonly options: GithubPauseWatchOptions<T>) {
    this.paused = options.isPaused();
    this.syncTimer();
  }

  check(): void {
    const paused = this.options.isPaused();
    if (paused !== this.paused) {
      this.paused = paused;
      this.options.onChange();
    }
    this.syncTimer();
  }

  dispose(): void {
    this.stopTimer();
  }

  private syncTimer(): void {
    if (this.paused && this.timer === undefined) {
      this.timer = this.options.setTimer(() => this.check());
    } else if (!this.paused) {
      this.stopTimer();
    }
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      this.options.clearTimer(this.timer);
      this.timer = undefined;
    }
  }
}
