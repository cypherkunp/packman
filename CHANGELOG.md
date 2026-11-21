# Changelog

## Unreleased

- **`package.json` now opens in the normal text editor by default.** UI mode is still there, but opt-in: open it with the eye icon in the editor title bar, `Cmd/Ctrl+Shift+M`, or Reopen Editor With… → Packman. If you prefer UI mode as before, set it as the default with Reopen Editor With… → Configure default editor for `package.json`.
- New Overlay in the text editor, which never changes the file:
  - a ▶ Run action above each script, or a single "Trust workspace to run scripts" action in untrusted workspaces (diffs and `git:` views get none);
  - a short signal at the end of each Dependency's line: `→ 2.0.0` when a newer version is out, `✓ latest`, a Socket score, or what failed;
  - a hover on each Dependency with its latest version, npm and GitHub links, open issues + PRs and Socket score. GitHub is fetched only when you hover, to stay within its rate limit;
  - a summary above each dependency block (`12 deps · 2 outdated`, Socket alerts, `GitHub paused`) with a ↻ Refresh action.

  Turn it off with `packman.overlay.enabled`, or hide it for the session with Packman: Toggle Overlay.
- "Packman: Open Edit Mode" is now **Packman: Open in Text Editor**, and UI mode's Edit mode button is now **Text editor**.

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
