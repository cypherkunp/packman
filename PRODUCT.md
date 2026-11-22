# Product

<!-- impeccable:product-schema 1 -->

## Platform

editor-native

(A VS Code / Cursor extension. The Overlay is built only from the text editor's own surfaces: CodeLenses, end-of-line decorations and hovers. There is no webview and no standalone site.)

## Users

The primary user is the everyday JS/TS app developer working in their own repo in VS Code or Cursor. They open `package.json` mid-task, usually to run a script quickly, and sometimes to see at a glance whether their dependencies are out of date or unhealthy. They are already in the editor, already in flow, and want to get back to code.

## Product Purpose

Packman adds script runners and dependency intelligence right inside `package.json`. The file opens in the native text editor, carrying the **Overlay**: a **Run action** above each script, a **Dependency signal** beside each **Dependency** (latest version, open issues, Socket.dev score), **Dependency details** on hover, and a **Block summary** above each dependency block. Success means the developer runs a script or answers "is this dependency OK?" without leaving the file they're editing.

## Positioning

The pairing is the point: running scripts and judging every Dependency, in the file itself, in a way that feels like part of VS Code. Single-purpose extensions do one half (inline version lenses, script tree views); Packman puts both into the `package.json` text editor, with nothing to switch to.

## Operating Context

- Hosts: VS Code and Cursor (published to Marketplace and Open VSX).
- `package.json` opens in the native text editor with the Overlay. Packman contributes no custom editor; users who pinned the retired one through `workbench.editorAssociations` get a one-time prompt to remove it.
- Run actions run `<pm> run <script>` using the package manager detected from the lockfile (pnpm / yarn / bun, else npm), with cwd = the package.json folder, in a reused `Packman: <folder>` terminal.
- Enrichment comes from the npm registry, the GitHub REST API, and Socket.dev (end-user org token + org slug only).
- GitHub needs no setup: Packman uses the editor's signed-in GitHub account (5,000/hr). Until it has access, the Block summary offers a one-click sign-in; `packman.github.token` is only an override. Unauthenticated access gets 60/hr.
- Fetching is strictly user-driven: when a `package.json` editor is opened or shown again after its cache expired, when a new Dependency is typed, or on Refresh (visible editors only). Results are cached for an hour; there are no timers, no background tabs and no automatic retry.
- Users work in any VS Code theme: light, dark, high contrast.

## Capabilities and Constraints

- The Overlay covers `scripts` and the four dependency blocks (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`). **Override entries** (`overrides` / `resolutions`) get nothing; every other field is just the file's text.
- Dependency signal: `✓ latest` or `↑ x.y.z`, then open issues (GitHub counts issues and PRs together) and the Socket score. Unknown parts are left out; non-npm Dependencies show only their source.
- Socket parts appear only once the user configures a token; Dependency details offer a link to configure it. Richer or redistributable Socket integration is deferred (#16).
- Rate limits, missing tokens and fetch failures degrade gracefully (e.g. GitHub issue counts pause and show when they resume).
- **Packman never writes the JSON.** The Overlay never edits `package.json`; every change is one the developer types in the text editor.
- **Styling uses theme colours only.** Every decoration colour is a VS Code `ThemeColor`; there is no brand palette or custom typeface. Must hold up in light, dark and high-contrast themes. See `DESIGN.md`.
- Workspace Trust: untrusted workspaces get a single "Trust workspace to run scripts" action instead of Run actions; read-only and diff views get no Run actions.
- Not yet specified: private registries, Marketplace listing copy.
- Terminology is defined in `CONTEXT.md` (Packman, Overlay, Run action, Dependency, Dependency signal, Dependency details, Block summary, Override entry); use those terms in UI copy and code.

## Brand Commitments

- Name: **Packman**. Publisher: `cypherkunp`. MIT licensed.
- The visual identity is the host editor's; Packman adds no brand colors or fonts of its own.

## Evidence on Hand

- Research notes: `docs/research/` (npm registry metadata, GitHub open-issues resolution, Socket.dev signals).
- Decisions: `docs/adr/`, the v1 Overlay-only map (#42) and its sub-issues.
- No marketing site, screenshots, testimonials, user counts or Marketplace listing copy exist yet; do not invent them.

## Product Principles

1. **Feels native.** The Overlay uses only the editor's own surfaces and colours. If something needs a surface the editor doesn't have, Packman doesn't show it.
2. **Fast in, fast out.** The common job is "run a script" or "glance at deps"; both happen in the file the developer already has open, with nothing to switch to.
3. **Signals live next to their Dependency.** A glance on the line, the full story on hover, so the developer never has to open a browser tab to judge a package.
4. **Quiet by default.** Nothing is fetched in the background, nothing flickers, and missing data is left out or stated in words.
5. **Never write for the user.** The Overlay presents and acts (runs scripts, opens links and settings); it never edits the JSON or the user's settings without a click.

## Accessibility & Inclusion

- CodeLenses and hovers are the editor's own, so they follow its keyboard and screen-reader support.
- Every Run action and Block summary action is a word, not an icon alone (`▶ Run`, `↻ Refresh`), with a tooltip.
- Must remain legible in VS Code high-contrast themes; never rely on colour alone for status: every state is a word or symbol (`✓ latest`, `↑`, `⚠`, `⏸`).
