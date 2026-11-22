# Packman

Script runners and dependency intelligence right inside your `package.json`, in VS Code or Cursor. Run its scripts with one click, and check each dependency against the latest version, its GitHub repo and Socket's supply-chain score without leaving the editor.

Packman follows your color theme (light, dark and high contrast). `package.json` opens in the normal text editor, so you can edit it straight away; Packman's **Overlay** sits on top of the text and never changes the file.

## What you get

- **Run actions.** A **▶ Run** action above each script. It runs the script in a reused `Packman: <folder>` terminal, using the package manager your lockfile points to (pnpm, yarn, bun or npm), from the `package.json` folder. In a workspace you haven't trusted you get a single **Trust workspace to run scripts** action instead; diffs, `git:` views and read-only files get no Run actions.
- **Dependency signals.** At the end of each Dependency's line, a short signal: `✓ latest` or `↑ 19.2.0` (in a warning colour when the jump is breaking), then `· 1,043 issues` and `· Socket 82` (`⚠ Socket 41` when Socket reports high or critical alerts). Parts that aren't known yet are left out, and the Socket part appears only when Socket is set up. Dependencies that don't come from npm (`workspace:`, `catalog:`, `file:`, git, URLs) show only where they come from. `overrides` and `resolutions` get nothing.
- **Dependency details.** Hover a Dependency for its latest version, npm and GitHub links, open issues and pull requests, its Socket score, and what failed and why, with a Refresh link.
- **Block summaries.** Above each dependency block, a summary such as `12 deps · 2 outdated · 1 Socket alert`, with `GitHub paused` while GitHub is rate limited, and a **↻ Refresh** action.

Turn the Overlay off with the `packman.overlay.enabled` setting, or hide it for the session with **Packman: Toggle Overlay**.

Packman never writes to your `package.json`; every change is one you make in the text editor.

## GitHub issue counts, with no setup

Packman uses the GitHub account you're signed in to in the editor (Accounts menu), which allows 5,000 requests an hour. Until Packman has access, each Block summary shows **Sign in to GitHub for issue counts**; click it once to approve access in the editor's own prompt. Without access GitHub allows 60 requests an hour, and when that runs out the signal shows `issues ⏸` until you next open the file, type a Dependency or click Refresh. A token in `packman.github.token` is only needed to use a different account.

## When data is fetched

Only when you act: when you open a `package.json` (or switch back to it after its data has expired), type a new Dependency, click Refresh, change the Socket settings, or click Sign in to GitHub; the last three cover only the editors you can see. What's on screen is fetched first, and results are cached for an hour. Nothing is fetched in the background, and nothing is retried on its own.

## Settings

| Setting | Purpose |
|---|---|
| `packman.overlay.enabled` | Show the Overlay (Run actions, Dependency signals, Dependency details and Block summaries) in the `package.json` text editor. Default on. |
| `packman.github.token` | Optional override for issue counts. Not needed when you're signed in to GitHub in the editor. Public repo metadata needs no scopes. |
| `packman.socket.apiToken` | Socket.dev API token. Set it with `packman.socket.orgSlug` to show Socket scores. |
| `packman.socket.orgSlug` | Your Socket organization slug. |

Commands: **Packman: Toggle Overlay**, **Packman: Refresh Enrichment**, **Packman: Sign in to GitHub**, **Packman: Open GitHub Settings**, **Packman: Open Socket Settings**.

## Data sources and privacy

Packman sends only the names and versions of your dependencies to the npm registry, the GitHub REST API and, if you configure a token, the Socket.dev API. Results are cached in memory for an hour. Nothing is collected by Packman itself.

When a service is rate limited, offline or slow, the affected Dependency signals and details say so (`issues ⏸`, `⚠ npm offline`, `timed out`) and everything else keeps working.

## Requirements

VS Code 1.85 or later, or a matching Cursor version.

## License

[MIT](LICENSE)
