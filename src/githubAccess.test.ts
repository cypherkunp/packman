import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GithubAccess, type GithubAccessOptions } from "./githubAccess";

type SessionRequest = { scopes: string[]; interactive: boolean };

function harness(
  options: {
    configured?: string;
    silent?: string | undefined;
    interactive?: () => Promise<string | undefined>;
  } = {},
) {
  const requests: SessionRequest[] = [];
  let silent = options.silent;
  const events = { granted: 0, changed: 0 };
  const access = new GithubAccess({
    configuredToken: () => options.configured,
    getSession: async (scopes, { interactive }) => {
      requests.push({ scopes: [...scopes], interactive });
      if (!interactive) {
        return silent ? { accessToken: silent } : undefined;
      }
      const token = await (options.interactive?.() ?? Promise.resolve(undefined));
      if (token) {
        silent = token;
      }
      return token ? { accessToken: token } : undefined;
    },
    onGranted: () => {
      events.granted += 1;
    },
    onChange: () => {
      events.changed += 1;
    },
  } satisfies GithubAccessOptions);
  return {
    access,
    requests,
    events,
    setSilent: (token: string | undefined) => (silent = token),
  };
}

describe("GithubAccess", () => {
  it("is unknown until a token is resolved, then follows token precedence", async () => {
    const withSetting = harness({ configured: " pat ", silent: "session" });
    assert.equal(withSetting.access.hasAccess, undefined);
    assert.equal(await withSetting.access.token(), "pat");
    assert.equal(withSetting.access.hasAccess, true);
    assert.deepEqual(withSetting.requests, []);

    const signedIn = harness({ silent: "session" });
    assert.equal(await signedIn.access.token(), "session");
    assert.equal(signedIn.access.hasAccess, true);
    assert.deepEqual(signedIn.requests, [
      { scopes: ["read:user"], interactive: false },
    ]);

    const none = harness();
    assert.equal(await none.access.token(), undefined);
    assert.equal(none.access.hasAccess, false);
    assert.equal(none.events.changed, 1);
  });

  it("never asks interactively without a sign-in click", async () => {
    const { access, requests } = harness({
      interactive: async () => "granted",
    });
    await access.token();
    await access.token();
    assert.ok(requests.every((request) => !request.interactive));
  });

  it("asks once per click and re-fetches visible editors when granted", async () => {
    let resolve: (token: string | undefined) => void = () => {};
    const { access, requests, events } = harness({
      interactive: () => new Promise((done) => (resolve = done)),
    });
    await access.token();
    const first = access.signIn();
    const second = access.signIn();
    resolve("granted");
    await Promise.all([first, second]);
    assert.deepEqual(
      requests.filter((request) => request.interactive),
      [{ scopes: ["read:user"], interactive: true }],
    );
    assert.equal(access.hasAccess, true);
    assert.equal(events.granted, 1);
    assert.equal(await access.token(), "granted");
  });

  it("does not re-fetch when the consent prompt is declined", async () => {
    const declined = harness({ interactive: async () => undefined });
    await declined.access.token();
    await declined.access.signIn();
    assert.equal(declined.events.granted, 0);
    assert.equal(declined.access.hasAccess, false);

    const failed = harness({
      interactive: async () => {
        throw new Error("user cancelled");
      },
    });
    await failed.access.token();
    await failed.access.signIn();
    assert.equal(failed.events.granted, 0);
    assert.equal(failed.access.hasAccess, false);
  });

  it("never re-fetches when access appears from elsewhere, only after a sign-in click", async () => {
    const outside = harness();
    await outside.access.token();
    outside.setSilent("session");
    await outside.access.sessionsChanged();
    assert.equal(outside.access.hasAccess, true);
    assert.equal(outside.events.granted, 0);
    assert.ok(outside.requests.every((request) => !request.interactive));

    const clicked = harness({ interactive: async () => "granted" });
    await clicked.access.token();
    await clicked.access.signIn();
    await clicked.access.sessionsChanged();
    assert.equal(clicked.events.granted, 1);
  });

  it("shows the sign-in again after signing out, without fetching", async () => {
    const { access, events, setSilent } = harness({ silent: "session" });
    await access.token();
    setSilent(undefined);
    const changedBefore = events.changed;
    await access.sessionsChanged();
    assert.equal(access.hasAccess, false);
    assert.equal(events.granted, 0);
    assert.equal(events.changed, changedBefore + 1);
  });
});
