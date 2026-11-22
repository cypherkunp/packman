import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GithubPauseWatch } from "./githubPauseWatch";

function fakeTimers() {
  const timers = new Map<number, () => void>();
  let next = 0;
  return {
    timers,
    setTimer: (callback: () => void) => {
      next += 1;
      timers.set(next, callback);
      return next;
    },
    clearTimer: (id: number) => {
      timers.delete(id);
    },
    tick: () => {
      for (const callback of [...timers.values()]) {
        callback();
      }
    },
  };
}

describe("GithubPauseWatch", () => {
  it("reports a pause as soon as it is checked, with no timer wait", () => {
    let paused = false;
    let changes = 0;
    const timers = fakeTimers();
    const watch = new GithubPauseWatch({
      isPaused: () => paused,
      onChange: () => {
        changes += 1;
      },
      ...timers,
    });

    paused = true;
    watch.check();

    assert.equal(changes, 1);
  });

  it("does not report when the pause state hasn't changed", () => {
    let changes = 0;
    const watch = new GithubPauseWatch({
      isPaused: () => false,
      onChange: () => {
        changes += 1;
      },
      ...fakeTimers(),
    });

    watch.check();
    watch.check();

    assert.equal(changes, 0);
  });

  it("polls only while paused, to notice when GitHub resumes", () => {
    let paused = false;
    let changes = 0;
    const timers = fakeTimers();
    const watch = new GithubPauseWatch({
      isPaused: () => paused,
      onChange: () => {
        changes += 1;
      },
      ...timers,
    });
    assert.equal(timers.timers.size, 0);

    paused = true;
    watch.check();
    assert.equal(timers.timers.size, 1);

    paused = false;
    timers.tick();

    assert.equal(changes, 2);
    assert.equal(timers.timers.size, 0);
  });

  it("stops polling once disposed", () => {
    const timers = fakeTimers();
    const watch = new GithubPauseWatch({
      isPaused: () => true,
      onChange: () => undefined,
      ...timers,
    });
    watch.check();

    watch.dispose();

    assert.equal(timers.timers.size, 0);
  });
});
