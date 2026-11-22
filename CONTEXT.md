# Packman

A VS Code / Cursor extension that adds script runners and dependency intelligence to `package.json`, directly in the text editor.

## Language

**Packman**:
The VS Code / Cursor extension for viewing and acting on a `package.json` through the Overlay.
_Avoid_: the viewer, the panel, package UI

**Overlay**:
The set of Packman additions attached to a `package.json` in the text editor: Run actions, Dependency signals, Dependency details, and Block summaries. The only way Packman appears.
_Avoid_: lens mode, inline mode, annotations, edit mode, UI mode

**Run action**:
The Overlay's one-click action bound to one `scripts` entry; runs that script via the detected package manager in a reused terminal for the package's folder.
_Avoid_: script button, task, npm script launcher

**Dependency**:
One installable package entry from `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`. Its enrichment (latest version, GitHub repo, open issues, Socket) belongs to the Dependency.
_Avoid_: dependency row, dependency line, package line, module row

**Dependency signal**:
The compact one-line summary shown beside a Dependency: version status (up to date, or the newer version available), open issues, and Socket score. For a Dependency that doesn't come from the npm registry, only its source (workspace, git, local, …).
_Avoid_: badge, decoration, inline info

**Dependency details**:
The full enrichment for one Dependency, shown on hover: latest version, npm link, GitHub repo, open issues and PRs, Socket breakdown, and any notes on why data is missing.
_Avoid_: tooltip, popup, info card

**Block summary**:
The one-line overview above a dependency block: how many Dependencies, how many outdated, how many Socket alerts, whether GitHub is paused, and a Refresh action.
_Avoid_: header, block lens, stats

**Override entry**:
An `overrides` or `resolutions` mapping; not a Dependency, not enriched, and given no Overlay.
_Avoid_: dependency override row

## Retired terms

**UI mode**: formerly a separate webview presentation of `package.json`. Removed; everything it showed is either the file's own text or part of the Overlay.

**Edit mode**: formerly the native text editor as entered from UI mode. Call it "the text editor".

**Script button**: renamed to **Run action**; there is no button surface any more.

**Dependency row**: renamed to **Dependency**; enrichment is no longer tied to a table row.
