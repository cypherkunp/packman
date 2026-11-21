# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(UI mode is an HTML webview inside the VS Code / Cursor custom editor, not a standalone site.)

## Users

The primary user is the everyday JS/TS app developer working in their own repo in VS Code or Cursor. They open `package.json` mid-task, usually to run a script quickly, and sometimes to see at a glance whether their dependencies are out of date or unhealthy. They are already in the editor, already in flow, and want to get back to code.

## Product Purpose

Packman opens `package.json` in **UI mode** by default: a native-feeling, read-oriented view of the file with **Script buttons** that run in a terminal and **Dependency rows** enriched with latest version, GitHub repo / open issues, and Socket.dev risk. **Edit mode** (the native text editor) is one button or keybinding away. Success means the developer runs a script or answers "is this dependency OK?" without leaving the editor or reading raw JSON.

## Positioning

The pairing is the point: a whole-file overview of `package.json`, with every dependency signal in one place, that feels like part of VS Code rather than a webpage embedded in it. Single-purpose extensions do one half (inline version lenses, script tree views); Packman replaces the default `package.json` experience while staying one keystroke from the text.

## Operating Context

- Hosts: VS Code and Cursor (same custom-editor API; published to Marketplace and Open VSX).
- Opens by default for `**/package.json` via `CustomTextEditorProvider`; toggles to Edit mode with `Cmd/Ctrl+Shift+M` or the editor title button.
- Script buttons run `<pm> run <script>` using the package manager detected from the lockfile (pnpm / yarn / bun, else npm), with cwd = the package.json folder, in a reused `Packman: <folder>` terminal.
- Enrichment comes from the npm registry, the GitHub REST API (unauthenticated 60/hr, or a token / signed-in GitHub account for 5,000/hr), and Socket.dev (end-user org token + org slug only).
- Users work in any VS Code theme: light, dark, high contrast.

## Capabilities and Constraints

- First-class fields: name, version, description, license, engines, scripts, `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, and `overrides` / `resolutions` (shown as **Override entries**, separate from Dependency rows, not enriched). Everything else renders generically.
- Dependency columns: name, range, latest, GitHub, open issues (count covers issues + PRs, noted in a tooltip), Socket.
- Socket column shows a call to action until the user configures a token; richer or redistributable Socket integration is deferred (#16).
- Rate limits, missing tokens and fetch failures degrade gracefully (e.g. GitHub issue counts pause and show when they resume).
- **UI mode is read-oriented.** It does not edit the JSON; all edits happen in Edit mode.
- **Styling uses VS Code theme tokens only.** Colors and fonts come from `--vscode-*` variables (and codicons); there is no brand palette or custom typeface. Must hold up in light, dark and high-contrast themes.
- Webview runs under a strict nonce-based CSP (`default-src 'none'`).
- Not yet specified: Workspace Trust / script-execution policy, private registries, `workspace:` / `catalog:` protocol display, Marketplace listing copy.
- Terminology is defined in `CONTEXT.md` (Packman, UI mode, Edit mode, Script button, Dependency row, Override entry); use those terms in UI copy and code.

## Brand Commitments

- Name: **Packman**. Publisher: `cypherkunp`. MIT licensed.
- The visual identity is the host editor's; Packman adds no brand colors or fonts of its own.

## Evidence on Hand

- Research notes: `docs/research/` (npm registry metadata, GitHub open-issues resolution, Socket.dev signals, VS Code custom editor pattern).
- Product decisions: GitHub issue #1 (v1 map) and its sub-issues #2–#22.
- No marketing site, screenshots, testimonials, user counts or Marketplace listing copy exist yet; do not invent them.

## Product Principles

1. **Feels native.** If it looks like a webpage dropped into the editor, it's wrong. Follow VS Code's layout, density, controls and keyboard conventions.
2. **Fast in, fast out.** The common job is "run a script" or "glance at deps"; those must be immediate, and the text is always one keystroke away.
3. **Signals live next to their dependency.** Every piece of enrichment sits on its Dependency row, so the developer never has to open a browser tab to judge a package.
4. **Read here, edit there.** UI mode presents and acts (runs scripts, opens links); it never edits the JSON.

## Accessibility & Inclusion

- Everything in UI mode is reachable and operable by keyboard, with a visible focus state from the theme's `focusBorder`.
- Script buttons, Dependency row columns and status/empty states have meaningful screen-reader labels (no icon-only controls without names).
- Must remain legible in VS Code high-contrast themes; never rely on color alone for status.
