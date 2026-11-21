# Changelog

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
