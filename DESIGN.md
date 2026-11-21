---
name: Packman
description: A package.json viewer that looks and behaves like part of VS Code, in whatever theme the user runs.
typography:
  title:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "1.35em"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.01em"
  section-label:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "0.875em"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.06em"
  body:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "var(--vscode-font-size)"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "var(--vscode-editor-font-family)"
    fontSize: "var(--vscode-editor-font-size)"
    fontWeight: 400
    lineHeight: 1.45
  column-head:
    fontFamily: "var(--vscode-font-family)"
    fontSize: "var(--vscode-font-size)"
    fontWeight: 600
    lineHeight: 1.45
rounded:
  base: "4px"
spacing:
  col-gap: "1.5rem"
  cell-x: "0.75rem"
  row-gap: "0.55rem"
  stack-gap: "0.4rem"
  section: "1.75rem"
  page-x: "1.5rem"
components:
  script-button:
    rounded: "{rounded.base}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.body}"
  code-block:
    rounded: "{rounded.base}"
    padding: "0.55rem 0.7rem"
    typography: "{typography.data}"
  action-button:
    rounded: "{rounded.base}"
    padding: "0.25rem 0.65rem"
    typography: "{typography.body}"
  table-cell:
    padding: "0.45rem 0 0.45rem 0.75rem"
    typography: "{typography.data}"
  notice:
    rounded: "{rounded.base}"
    padding: "0.55rem 0.75rem"
---

# Design System: Packman

## Overview

**Creative North Star: "The Native Instrument"**

Packman is a tool, not a page. UI mode should read as something that shipped with VS Code: it takes its colors, fonts and focus behavior from the host and adds none of its own. Nothing here has a fixed hex value; every color is a `--vscode-*` token, so the same markup is correct in any light, dark or high-contrast theme, in VS Code and in Cursor.

The density is that of an editor panel: a single left-aligned column up to 60rem, headed by the package's own `name@version` with Refresh and Text editor beside it, small uppercase section labels, key/value pairs and tables that read like the file they summarize. Hierarchy comes from weight, case and the theme's muted foreground, not from size jumps or ornament. The one place the system lets itself be more present is the Script button, which is built to be pressed and answers the press.

**Key Characteristics:**
- No colors, fonts or icons of its own: theme tokens only.
- Editor-panel density, one column, max 60rem; the package name is the title.
- Muted labels, full-strength values; data in the editor font.
- Flat at rest; structure from 1px theme borders, never shadows.
- Script buttons are tactile: they have a visible hover, a pressed state and a focus ring.
- Missing data is stated plainly (muted, warning, or error tokens), never guessed.
- Dependencies give a verdict in words (`major`, `alerts`, "2 need attention"), not raw numbers alone.

## Colors

A role-mapped palette with no literal values. Each role is a VS Code token, with a fallback chain where the theme may not define it.

### Primary
- **Link Blue** (`--vscode-textLink-foreground`): links to npm, GitHub and Socket. Underline appears on hover only.

### Secondary
- **Secondary Button Surface** (`--vscode-button-secondaryBackground`, text `--vscode-button-secondaryForeground`, hover `--vscode-button-secondaryHoverBackground`, falling back to `--vscode-toolbar-hoverBackground`): the Script button face.

### Neutral
- **Editor Ground** (`--vscode-editor-background`): page background.
- **Body Ink** (`--vscode-foreground`): default text. Code uses `--vscode-editor-foreground`.
- **Muted Label** (`--vscode-descriptionForeground`): section labels, `dt` keys, script commands, `.muted` cells. Never lowered further with opacity.
- **Hairline** (`--vscode-widget-border`, falling back to `--vscode-panel-border`): 1px borders on tables and code blocks and between rows.
- **Code Well** (`--vscode-textCodeBlock-background`): code block fill.
- **Column-Head Wash** (`--vscode-editor-inactiveSelectionBackground`): table header row.
- **Focus Ring** (`--vscode-focusBorder`): the only focus color.

### Status
- **Error Red** (`--vscode-errorForeground`): parse-error detail and the Socket `alerts` label. Reserved for real risk; fetch failures are muted words, not red.
- **Warning Ink** (`--vscode-editorWarning-foreground`): the `major` (breaking) label and the "need attention" count.
- **Warning Surface** (`--vscode-inputValidation-warningBackground` / `-warningBorder` / `-warningForeground`): the rate-limit notice.
- **Keybinding Label** (`--vscode-keybindingLabel-*`): the `<kbd>` shortcut next to Text editor.

### Syntax (JSON blocks)
Keys use `--vscode-symbolIcon-keyForeground`, strings `--vscode-debugTokenExpression-string`, numbers `--vscode-debugTokenExpression-number`, booleans `--vscode-debugTokenExpression-boolean`, null `--vscode-symbolIcon-nullForeground`. These match the editor's own highlighting by construction.

### Named Rules
**The Borrowed Palette Rule.** Never write a hex, rgb or hsl color in UI mode. If a role has no token, find the nearest `--vscode-*` token and give it a fallback chain.
**The Not-Color-Alone Rule.** Status is never carried by color alone: every status is a word (`major`, `alerts`, `paused`, `offline`, `timed out`), and color only reinforces it.
**The No-Fade Rule.** Never dim text with `opacity`. Use the muted token; opacity on top of it fails contrast.

## Typography

**UI Font:** `var(--vscode-font-family)`
**Data Font:** `var(--vscode-editor-font-family)`, falling back to `ui-monospace, monospace`

**Character:** One family pair inherited from the user's editor. The UI font frames the page (labels, titles, script names); the editor font carries everything that is data (values, versions, tables, commands), so numbers and package names line up as they do in the file.

### Hierarchy
- **Title** (600, 1.35em, -0.01em): the single `h1`, `name` plus a muted `@version`. Falls back to "package.json".
- **Section label** (600, 0.875em, 0.06em tracking, uppercase, muted): `h2` for each block, with a count (Scripts 6, Dependencies 4).
- **Body** (400, `--vscode-font-size`, 1.45): default text and script names (script names at 600).
- **Data** (400, `--vscode-editor-font-size`, editor font): table cells, key/value values, script commands (muted).
- **Column head** (600, `--vscode-font-size`, full foreground): table `thead th`. Never smaller than body.

### Named Rules
**The Host Size Rule.** Body size is whatever `--vscode-font-size` says. Scale everything else in `em` from there (`rem` is the browser's 16px, not the editor's), never compound `em` below 11px, and keep the hierarchy within a narrow range.

## Layout

A single column, `max-width: 60rem`, left-aligned in the panel, padded `1.25rem 1.5rem 3rem`. Sections stack with `2rem` between them. Key/value fields use a two-column grid (label at least 6rem, flexible value), values left-aligned. Dependency tables use `table-layout: fixed` with one shared `<colgroup>` (range 7.5em, latest 10.5em, GitHub 6em, issues 7.5em, Socket 9em; the name takes the rest), so columns line up across every dependency section. Cells inset `0.75rem` from the wrapper on both outer edges. Below a 46rem container width each dependency becomes a block: name on the first line, then labelled details that wrap ("Range ^18.2.0  Latest 19.2.0 major …"). The page never scrolls sideways. Script buttons stack in a flex column with a `0.4rem` gap.

### Named Rules
**The Name Gets the Slack Rule.** In any table, the first column is the one that flexes; every other column has a fixed width shared across tables. When the name would get too narrow, the table stacks instead of crushing it.

## Elevation & Depth

Flat. There are no shadows. Containers are defined by a 1px hairline border and, for code and table heads, a subtle tonal fill taken from the theme. The only depth cue is interaction: a Script button shifts background on hover and scales to 0.99 while pressed.

### Named Rules
**The Flat-By-Default Rule.** Nothing casts a shadow. If something needs to stand out, change its fill or border token, not its elevation.

## Shapes

One radius: 4px, on Script buttons, code blocks, table wrappers and the notice. Borders are always 1px. No pills, no circles, no clipping or decorative shapes. Tables are one bordered, rounded wrapper with ruled rows; the last row has no rule.

## Components

### Script Button
Tactile and confident: a full-width row that reads as a button.
- **Shape:** 4px radius, 1px border (`--vscode-button-border`, else hairline), `0.5rem 0.75rem` padding so text never touches the border.
- **Fill:** secondary button background and foreground.
- **Content:** script name left (600, wraps anywhere), command right (editor font, muted, ellipsis; full command in the tooltip and accessible name "Run build: tsc -p ./").
- **Hover:** secondary hover background, 120ms ease-out.
- **Focus:** 1px `--vscode-focusBorder` outline, 1px offset.
- **Active:** scale 0.99 over 80ms (off under reduced motion).
- **Started:** for 1.5s after a click the command is replaced by "Started in terminal", the border takes the focus color, further clicks are ignored (no double runs), and a polite live region announces it.

### Masthead
`h1` is `name@version` (version muted). Right of it, two compact secondary buttons (`0.25rem 0.65rem`, 4px radius): **Refresh** (only when there are dependencies) and **Text editor** with the platform keybinding in a `<kbd>`. Below: the description (max 70ch) and a `role="status"` line that reads "Fetching registry, GitHub and Socket data…" while enrichment runs.

### Key/Value List
`dl` as a grid. Keys in muted foreground; values in the editor font, left-aligned. Small flat objects of strings (e.g. `engines`) render inline as muted key + value pairs instead of a code block.

### Code Block
Used for structured values. 4px radius, hairline border, code-well fill, `0.55rem 0.75rem` padding, editor font and size, `pre` whitespace with horizontal scroll, text selectable. Under "Other fields" each structured value sits in a collapsed `<details>` row (hairline rules, drawn chevron, key plus "5 keys" / "6 items"); open state survives live updates.

### Dependency Table
Bordered wrapper with 4px radius, a visually hidden `<caption>`, `scope="col"` heads and the package name as the row header. Column heads: full foreground, 600, tinted fill. Cells: `0.45rem 0.75rem` inset, hairline row rules, tabular numerals.
- **Section head:** label + count, then a verdict: "2 need attention" (warning ink, 600) or "All within range" (muted). Hidden while loading.
- **Latest:** version, then a word when the range doesn't allow it: `major` (warning ink, 600, a breaking jump, including 0.x minors) or `minor` / `patch` (muted). Non-registry ranges (`workspace:*`, `file:`, git) show their source ("workspace") instead of a fetch error.
- **Socket:** `82/100` (the `/100` muted) and an `alerts` label in error red when Socket reports high or critical alerts. When no Socket token is set, the column is dropped and one hint line ("Socket risk scores are off. Set Socket token…") appears once, above the first table.
- **Cell states:** `…` (loading, announced as "loading"), `—` (not available, announced as such), `paused` / `offline` / `timed out` as muted words with a tooltip saying what to do.
- **Accessible names** include the package: "react repository on GitHub", "react: 1,043 open issues and pull requests".

### Notice
A warning-tinted block (`0.55rem 0.75rem`, 4px radius, warning border, background and foreground, max 70ch) placed above the first dependency table, never above Scripts. Used for a paused GitHub rate limit: what is paused, until when, what still works, how to fix it.

### Problem State
When package.json can't be parsed: an `h1` "package.json can’t be shown", one plain sentence, the parser detail in error red with the line and column, and an **Open in the text editor at line N, column M** button that opens the text editor with the caret there.

## Do's and Don'ts

### Do:
- **Do** use only `--vscode-*` tokens for color, with a fallback chain where a token may be absent.
- **Do** put data in the editor font and labels in the UI font.
- **Do** keep the 4px radius and 1px hairline borders everywhere, with a `0.75rem` inset between text and any border.
- **Do** update a live page with the `render` message, not by reassigning `webview.html`, so scroll, focus and open sections survive.
- **Do** give every interactive element a `:focus-visible` outline in `--vscode-focusBorder`.
- **Do** state missing or paused data in words (muted, warning, or error tokens), and keep the layout stable when it happens.
- **Do** verify any change in a light, a dark and a high-contrast theme.

### Don't:
- **Don't** introduce a brand color, a custom typeface, an icon font or an image asset.
- **Don't** add shadows, gradients, glows or rounded pills.
- **Don't** make UI mode editable; edits belong in the text editor.
- **Don't** convey status by color alone, and don't dim text with `opacity`.
- **Don't** let the page scroll horizontally; scroll wide content inside its own wrapper.
- **Don't** make UI mode look like a webpage in the editor: no hero areas, no marketing type scale, no centered layouts.
