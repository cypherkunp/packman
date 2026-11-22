---
status: accepted
---

# Remove UI mode; fetch Dependency signals when package.json is opened

ADR 0001 kept UI mode (the webview custom editor) as an opt-in beside the Overlay. We are removing it altogether. That leaves one surface to design, test and support. The Overlay shows what developers came for, and what UI mode displayed beyond that (identity fields, Override entries, other fields) is already the file's own text. The webview's free-form layout is the cost, and we accept it. The removal ships in the same release as the Overlay, so Marketplace users go straight from "UI mode by default" to "Overlay only".

This also reverses ADR 0001's "GitHub only on hover". Open-issue counts are now part of the inline **Dependency signal**, so GitHub data is fetched when a `package.json` is opened. Fetching stays strictly user-driven: data is fetched only when a `package.json` editor is opened or shown again after its cache has expired, when a new Dependency is typed in a visible editor, when the user clicks Refresh (visible editors only), on a Socket settings change (visible editors only), or when the user clicks Sign in to GitHub (GitHub data for visible editors only). A GitHub session that changes elsewhere (the Accounts menu, another extension) is only used by the next of these. There are no timers, no background tabs and no automatic retry when GitHub resumes. Results are cached for an hour.

GitHub access defaults to the editor's signed-in GitHub account, which allows 5,000 requests an hour, so the user never has to configure a token. `packman.github.token` remains only as an override. Without access, the 60/hr unauthenticated budget is spent on visible Dependencies first, then the signal degrades to a paused state, and the Block summary offers a one-click sign-in.

## Consequences

- Users who pinned the custom editor through `workbench.editorAssociations` get a one-time prompt to remove that association; Packman never edits their settings silently.
- The UI mode commands and the `Cmd/Ctrl+Shift+M` keybinding are removed without stubs, which is a breaking change in 0.1.0.
- The git-diff handoff code goes away with the custom editor, because it existed only to keep SCM diffs out of UI mode.
