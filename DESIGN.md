# Design: the Packman Overlay

Packman has one surface, the **Overlay**, and it is made only of the editor's own parts: CodeLenses, end-of-line decorations and hovers in the `package.json` text editor. It owns no layout, no fonts and no colours. Everything below is about the words it shows, which theme colour each one takes, and when it changes. Terms come from `CONTEXT.md`.

## Principles

- **Native or nothing.** If the editor has no surface for something, Packman doesn't show it. It never draws its own UI over the text.
- **Words carry the meaning, colour backs them up.** Every state reads correctly in a monochrome or high-contrast theme.
- **Say less, inline; say everything, on hover.** The Dependency signal is a glance; Dependency details are the full story.
- **Leave out what isn't known.** Unknown parts are dropped, not shown as placeholders, so a line never fills up with dashes.
- **Never write for the user.** The Overlay runs scripts and opens links and settings; it never edits `package.json`.

## Surfaces

### Run action (CodeLens)

- `▶ Run` above each `scripts` entry, tooltip `Run the "<name>" script`.
- In an untrusted workspace, one `Trust workspace to run scripts` lens above the `scripts` key instead of any Run action.
- Read-only documents, non-`file:`/`untitled:` schemes (git, PR reviews) and documents open only as a diff side get no script lenses.

### Block summary (CodeLens)

Above each non-empty `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies` key, in this order:

1. Counts, joined with ` · ` and not clickable: `12 deps · 2 outdated`, then `1 Socket alert` (only when Socket is configured), then `GitHub paused` (only while the GitHub budget is blocked). Singular and plural follow the count (`1 dep`, `2 deps`).
2. `Sign in to GitHub for issue counts` while Packman has no GitHub access (`Sign in to GitHub` while paused). It opens the editor's consent prompt; tooltip `Use the GitHub account signed in to the editor (5,000 requests/hour)`.
3. `↻ Refresh`, tooltip `Clear Packman enrichment and fetch it again`.

### Dependency signal (decoration)

Shown after a Dependency's line (or right after the entry when more entries follow on the same line), with a `2ch` left margin. Up to three parts, joined with ` · `:

| Part | Text | Tone |
|---|---|---|
| Version | `✓ latest` when the range allows the latest version | `latest` |
| | `↑ 19.2.0` when a newer version is outside the range | `outdated` |
| | the same, when the jump is breaking (major, or a 0.x minor) | `outdated-major` |
| | `⚠ npm offline` / `⚠ npm timed out` / `⚠ npm rate-limited` | `degraded` |
| Issues | `1,043 issues` (GitHub counts issues and PRs together) | `neutral` |
| | `issues ⏸` while GitHub is paused and the repo may exist | `paused` |
| Socket | `Socket 82` | `neutral` |
| | `⚠ Socket 41` for high or critical alerts | `risk` |

- With nothing known yet, the signal is `…` (`pending`).
- The Socket part appears only when Socket is configured and scored the Dependency.
- A Dependency that doesn't come from npm shows only its source (`workspace`, `catalog`, `local`, `alias`, `git` or `url`) in the `source` tone, and gets no hover.
- **Override entries** (`overrides`, `resolutions`) get nothing.
- When parts disagree, the whole line takes the most urgent tone: `risk` › `outdated-major` › `outdated` › `degraded` › `latest` › `neutral` › `paused`.

### Dependency details (hover)

Markdown paragraphs, in order, each present only when it has something to say:

1. `**name** · latest \`x.y.z\`` (just the name until latest is known).
2. Links: `npm · GitHub · N open issues + PRs`, followed by the note _GitHub counts open issues and pull requests together._
3. _GitHub repo and open issues + PRs loading…_ while GitHub hasn't answered.
4. `Socket score **82**/100 · details`, or `Configure Socket…` when Socket isn't set up.
5. `GitHub paused until 14:05 · add a token…` while rate-limited.
6. Failures in words (`⚠ npm lookup offline`, `⚠ GitHub timed out`), then `Refresh`.

The hover trusts only its own commands: Socket settings, GitHub settings and Refresh.

## Tones and theme colours

Each tone is one decoration type whose colour is a VS Code `ThemeColor` id. There are no hex values anywhere.

| Tone | Theme colour | Used for |
|---|---|---|
| `latest`, `neutral`, `pending` | `editorCodeLens.foreground` | up to date, counts, `…` |
| `outdated` | `editorInfo.foreground` | newer version in a compatible jump |
| `outdated-major` | `editorWarning.foreground` | breaking version jump |
| `risk` | `editorError.foreground` | risky Socket score; reserved for real risk |
| `paused`, `source`, `degraded` | `disabledForeground` | dimmed: paused, non-npm source, failed fetch |

Fetch failures are dimmed words, never red. Red means the package itself looks risky.

## Stability rules

- **Never flicker.** Results that stream in are coalesced (about 50 ms) into one render, and typing is debounced before anything is fetched. A signal never blanks while it waits; it keeps what it knows and adds parts as they arrive.
- **Last good text.** While `package.json` is broken mid-edit, entries that existed in the last well-formed text keep their lenses and signals at their positions; broken text never triggers a fetch.
- **Last good data.** Expired cache entries are refetched only when an editor is shown again, a new Dependency is typed, or the user clicks Refresh. Only Refresh and a Socket settings change clear what is shown, and both act on visible editors only.
- **No background work.** No timers fetch, background tabs never fetch, and nothing retries when GitHub resumes; paused parts wait for the next open, edit or Refresh.

## Don'ts

- Don't add a colour, font, icon font or image of Packman's own.
- Don't convey a state by colour alone, and don't dim with opacity: use the `disabledForeground` tone.
- Don't put more than three parts in a signal; detail belongs in the hover.
- Don't write to `package.json` or to the user's settings without a click.
