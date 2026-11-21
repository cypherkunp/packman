# Packman

Open `package.json` as a readable page inside VS Code or Cursor. Run its scripts with one click, and check each dependency against the latest version, its GitHub repo and Socket's supply-chain score without leaving the editor.

Packman follows your color theme (light, dark and high contrast) and stays one keystroke away from the plain text.

## What you get

**UI mode** is the default view for every `package.json`:

- **Package name and version** as the title, with **Edit mode** and **Refresh** buttons beside it.
- **Scripts** as buttons. Click one to run it in a reused `Packman: <folder>` terminal, using the package manager your lockfile points to (pnpm, yarn, bun or npm).
- **Dependencies**, **dev**, **peer** and **optional dependencies** as tables, each row showing:
  - the declared range and the latest published version, labelled `major`, `minor` or `patch` when latest falls outside your range;
  - a link to the GitHub repository and its count of open issues and pull requests;
  - the Socket.dev score out of 100, with an `alerts` label for high or critical alerts (needs a Socket token, see below).
- A per-section summary such as "2 need attention", so problems stand out without reading every row.
- **Overrides** (`overrides` / `resolutions`) listed separately from installable dependencies.
- Every other field, with nested objects collapsed until you open them.

**Edit mode** is VS Code's normal text editor for the same file. Switch with the **Edit mode** button or <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> on Windows and Linux). The same shortcut, or the eye icon in the editor title bar, brings you back. If the JSON is invalid, UI mode explains the problem and opens Edit mode at the exact line.

UI mode never edits the file; all changes happen in Edit mode.

## Settings

| Setting | Purpose |
|---|---|
| `packman.github.token` | Optional GitHub token for issue counts. When empty, Packman uses the GitHub account you are signed in with. Without either, GitHub allows 60 requests an hour, which one `package.json` can use up; with one, the limit is 5,000. Public repo metadata needs no scopes. |
| `packman.socket.apiToken` | Socket.dev API token. Set it with `packman.socket.orgSlug` to show Socket scores. |
| `packman.socket.orgSlug` | Your Socket organization slug. |

Commands: **Packman: Open UI Mode**, **Packman: Open Edit Mode**, **Packman: Refresh Enrichment**, **Packman: Open GitHub Settings**, **Packman: Open Socket Settings**.

## Data sources and privacy

Packman sends only the names and versions of your dependencies to the npm registry, the GitHub REST API and, if you configure a token, the Socket.dev API. Results are cached briefly in memory. Nothing is collected by Packman itself.

When a service is rate limited, offline or slow, the affected cells say so (`paused`, `offline`, `timed out`) and the rest of the page keeps working.

## Requirements

VS Code 1.85 or later, or a matching Cursor version.

## License

[MIT](LICENSE)
