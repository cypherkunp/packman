# Packman

Script runners and dependency intelligence right inside your `package.json`, in VS Code or Cursor. Run its scripts with one click, and check each dependency against the latest version, its GitHub repo and Socket's supply-chain score without leaving the editor.

Packman follows your color theme (light, dark and high contrast). `package.json` opens in the normal text editor, so you can edit it straight away; Packman's **Overlay** sits on top of the text, and **UI mode** is one keystroke away when you want the whole file as a readable page.

## What you get

**The Overlay** is what you see by default. It adds Packman's information to `package.json` in the text editor and never changes the file:

- A **▶ Run** action above each script. It runs the script in a reused `Packman: <folder>` terminal, using the package manager your lockfile points to (pnpm, yarn, bun or npm), from the `package.json` folder.
- In a workspace you haven't trusted, a single **Trust workspace to run scripts** action instead of Run actions. Diffs, `git:` views and read-only files get no Run actions.
- At the end of each Dependency's line, a short signal: `→ 2.0.0` when a newer version is out of your range, `✓ latest` when you're current, the Socket score when Socket is configured, or what failed (`⚠ npm offline`).
- **Hover** a Dependency for its latest version, npm and GitHub links, the count of open issues and pull requests, and its Socket score. GitHub data is fetched only when you hover, so one `package.json` doesn't use up GitHub's rate limit.
- Above each dependency block, a summary such as `12 deps · 2 outdated · 1 Socket alert`, with `GitHub paused` while GitHub is rate limited, and a **↻ Refresh** action that fetches everything again.
- Turn it off with the `packman.overlay.enabled` setting, or hide it for the session with **Packman: Toggle Overlay**.

**UI mode** is an opt-in, read-oriented page for the same file. Open it with the eye icon in the editor title bar, <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> on Windows and Linux), or **Reopen Editor With… → Packman**. It shows:

- **Package name and version** as the title, with **Text editor** and **Refresh** buttons beside it.
- **Scripts** as buttons. Click one to run it in a reused `Packman: <folder>` terminal, using the package manager your lockfile points to (pnpm, yarn, bun or npm).
- **Dependencies**, **dev**, **peer** and **optional dependencies** as tables, each row showing:
  - the declared range and the latest published version, labelled `major`, `minor` or `patch` when latest falls outside your range;
  - a link to the GitHub repository and its count of open issues and pull requests;
  - the Socket.dev score out of 100, with an `alerts` label for high or critical alerts (needs a Socket token, see below).
- A per-section summary such as "2 need attention", so problems stand out without reading every row.
- **Overrides** (`overrides` / `resolutions`) listed separately from installable dependencies.
- Every other field, with nested objects collapsed until you open them.

Go back to the text editor with the **Text editor** button, **Open in Text Editor** in the title bar, or the same shortcut. If the JSON is invalid, UI mode explains the problem and opens the text editor at the exact line.

Packman never writes to your `package.json`; every change is one you make in the text editor.

## Settings

| Setting | Purpose |
|---|---|
| `packman.github.token` | Optional GitHub token for issue counts. When empty, Packman uses the GitHub account you are signed in with. Without either, GitHub allows 60 requests an hour, which one `package.json` can use up; with one, the limit is 5,000. Public repo metadata needs no scopes. |
| `packman.socket.apiToken` | Socket.dev API token. Set it with `packman.socket.orgSlug` to show Socket scores. |
| `packman.socket.orgSlug` | Your Socket organization slug. |
| `packman.overlay.enabled` | Show the Overlay (Run actions, Dependency signals and hovers, block summaries) in the `package.json` text editor (default on). |

Commands: **Packman: Open UI Mode**, **Packman: Open in Text Editor**, **Packman: Toggle Overlay**, **Packman: Refresh Enrichment**, **Packman: Open GitHub Settings**, **Packman: Open Socket Settings**.

## Data sources and privacy

Packman sends only the names and versions of your dependencies to the npm registry, the GitHub REST API and, if you configure a token, the Socket.dev API. Results are cached briefly in memory. Nothing is collected by Packman itself.

When a service is rate limited, offline or slow, the affected Overlay signals and hovers, or UI mode cells, say so (`paused`, `offline`, `timed out`) and everything else keeps working.

## Requirements

VS Code 1.85 or later, or a matching Cursor version.

## License

[MIT](LICENSE)
