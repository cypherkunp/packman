# Changelog

## 1.1.0

First release on the VS Code Marketplace and Open VSX under the new ID `startfrom.packman`. It includes everything in 0.1.0 below. If you installed an earlier build of Packman, uninstall it so the two don't both run.

## 0.1.0

**Breaking: Packman is now Overlay-only.** `package.json` opens in the normal text editor, and Packman's information sits on top of the text instead of in a separate page. UI mode (the webview) is removed, along with **Packman: Open UI Mode**, **Packman: Open Edit Mode** and the `Cmd/Ctrl+Shift+M` keybinding. If you had made UI mode the default editor for `package.json`, Packman offers once to remove that association; it never changes your settings without the click.

The Overlay, which never changes the file:

- a ▶ Run action above each script, or a single "Trust workspace to run scripts" action in untrusted workspaces (diffs and `git:` views get none);
- a Dependency signal at the end of each Dependency's line: `✓ latest` or `↑ 19.2.0` (warning colour for a breaking jump), then open issues and the Socket score, leaving out what isn't known; non-npm Dependencies show only their source;
- Dependency details on hover: latest version, npm and GitHub links, open issues + PRs, Socket score, and what failed;
- a Block summary above each dependency block (`12 deps · 2 outdated`, Socket alerts, `GitHub paused`) with a ↻ Refresh action.

GitHub issue counts need no setup: Packman uses the GitHub account you're signed in to in the editor, and the Block summary offers a one-click sign-in until it has access. `packman.github.token` is now only an override.

Data is fetched only when you open or switch to a `package.json` (visible Dependencies first, cached for an hour), type a new Dependency, click Refresh, change the Socket settings, or click Sign in to GitHub; the last three cover visible editors only. Nothing is fetched in the background or retried when GitHub resumes.

Turn the Overlay off with `packman.overlay.enabled`, or hide it for the session with Packman: Toggle Overlay.

## 0.0.4

- UI mode header shows the package `name@version`, with Edit mode (and its shortcut) and Refresh buttons.
- Dependency rows now say when latest falls outside your range (`major`, `minor`, `patch`), and each section summarizes how many rows need attention.
- Socket scores read as `82/100`, with an `alerts` label for high or critical alerts. Without a Socket token the column is hidden and a single hint explains how to turn it on.
- Ranges such as `workspace:*`, `file:` and git URLs show where they resolve from instead of a fetch error.
- A loading state while registry, GitHub and Socket data is fetched.
- Updates apply in place, so scroll position, focus and open sections survive edits and refreshes. Fetches wait until you stop typing.
- Narrow editor groups show each dependency as a compact block instead of a squeezed table.
- Invalid JSON shows a plain explanation and opens Edit mode at the error's line and column.
- Script buttons confirm the run, and ignore repeat clicks for a moment so a double-click doesn't start a script twice.
- Accessibility: labelled tables, package names in link labels, readable header sizes, and no faded status text.
- GitHub rate-limit handling, using your signed-in GitHub account when no token is set.

## 0.0.3

- Script buttons run in a Packman terminal.
- Dependency rows enriched with latest version, GitHub repo and open issues, and Socket scores.
