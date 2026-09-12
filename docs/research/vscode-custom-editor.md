# VS Code custom editor: default UI mode and text Edit mode

Ticket: [#8](https://github.com/cypherkunp/packman/issues/8) · Map: [#1](https://github.com/cypherkunp/packman/issues/1)  
Researched: 2026-09-12 · Sources: VS Code Custom Editor guide, contribution points, built-in commands, `vscode.d.ts` / workbench sources, Cursor extensions help + forum (compatibility)

## Verdict

**Use `CustomTextEditorProvider` + `contributes.customEditors` with `priority: "default"` and selector `**/package.json`.** That is the supported pattern for a text/JSON file that should open in Packman UI mode by default. Toggle Edit mode (native text editor) and back with `vscode.openWith` (`'default'` ↔ Packman `viewType`), exposed as an editor-title button + keybinding. Do **not** use `CustomEditorProvider` for `package.json`. Cursor runs the same extension API (Open VSX / VS Code engine); keep `engines.vscode` within Cursor’s bundled API floor.

## Custom Text Editor vs Custom Editor

| | `CustomTextEditorProvider` | `CustomEditorProvider` / `CustomReadonlyEditorProvider` |
|---|---|---|
| Document model | VS Code `TextDocument` | Extension-owned `CustomDocument` |
| File kinds | Text (JSON, CSV, XML, …) | Binary / fully custom |
| Save / undo / hot exit | Handled by VS Code via text APIs | Extension implements `saveCustomDocument`, edit events, `backupCustomDocument`, **`revertCustomDocument`** |
| Complexity | Lower | Higher |

Official rule: *“if you are working with a text based file format use `CustomTextEditorProvider`, for binary file formats use `CustomEditorProvider`.”*

Sources: [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors) (`CustomEditor` vs `CustomTextEditor`), [`vscode.d.ts` `CustomTextEditorProvider`](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts).

**Packman:** `package.json` is text JSON → **`CustomTextEditorProvider` only.** UI mode is a webview view of the shared `TextDocument`; Edit mode is the built-in text editor on the same resource. Product already rejects form-based Edit mode (map #1 Out of scope).

Reference implementation: [custom-editor-sample `CatScratchEditorProvider`](https://github.com/microsoft/vscode-extension-samples/blob/main/custom-editor-sample/src/catScratchEditor.ts) (JSON-backed custom text editor: `WorkspaceEdit` out, `onDidChangeTextDocument` in).

## Default UI mode: contribution + associations

### `contributes.customEditors`

```json
"contributes": {
  "customEditors": [
    {
      "viewType": "packman.packageJson",
      "displayName": "Packman",
      "selector": [{ "filenamePattern": "**/package.json" }],
      "priority": "default"
    }
  ]
}
```

| Field | Role |
|---|---|
| `viewType` | Stable id; must match `registerCustomEditorProvider`; activation `onCustomEditor:packman.packageJson` |
| `displayName` | Shown in **Reopen Editor With…** / **Open With…** |
| `selector.filenamePattern` | Glob(s); `**/package.json` matches nested manifests |
| `priority` | `"default"` — try this editor for matching files; `"option"` — available but not automatic |

Sources: [Custom Editor API — Contribution point](https://code.visualstudio.com/api/extension-guides/custom-editors), [contributes.customEditors](https://code.visualstudio.com/api/references/contribution-points#contributes.customEditors).

Activation: on open, VS Code fires `onCustomEditor:VIEW_TYPE`; extension must register the provider during that activation ([Custom editor activation](https://code.visualstudio.com/api/extension-guides/custom-editors)).

### `workbench.editorAssociations`

User/workspace setting: glob → editor id. **Takes precedence over** contribution `priority` defaults.

```json
"workbench.editorAssociations": {
  "**/package.json": "packman.packageJson"
}
```

To force native text despite Packman’s `default` priority:

```json
"**/package.json": "default"
```

Setting description (workbench): *“Configure glob patterns to editors … These have precedence over the default behavior.”*  
Source: [`editorResolverService.ts` `workbench.editorAssociations`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/editor/common/editorResolverService.ts).

**Packman recommendation:** rely on **`priority: "default"`** for shipping default UI mode. Optional `configurationDefaults` for `workbench.editorAssociations` is redundant for the happy path (hex editor uses `"option"` + associations for special cases, not as the primary “own this file type” mechanism — [vscode-hexeditor `package.json`](https://github.com/microsoft/vscode-hexeditor/blob/main/package.json)). Document that users can pin text via associations / **Reopen Editor With…**.

### Diff / merge

Custom editor priority for diffs/merges defaults to **not** using the custom editor unless the contribution opts in (object form `priority.textEditor` / `diffEditor` / `mergeEditor`, or proposals). Leave Packman off diffs so git diffs stay as text.  
Source: extension point / `getPriorityFromContribution` in [contributedCustomEditors.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/customEditor/common/contributedCustomEditors.ts) (diff/merge default `never` when using the object form / current mainline behavior).

## Toggle: button + keybinding via `vscode.openWith`

### Built-in command

```ts
await vscode.commands.executeCommand(
  'vscode.openWith',
  uri,
  viewId, // 'default' | 'packman.packageJson'
  columnOrOptions // optional ViewColumn | TextDocumentShowOptions
);
```

API docs: `viewId` is the custom editor `viewType`, notebook type, or **`'default'` for VS Code’s default text editor**.  
Sources: [Built-in Commands — `vscode.openWith`](https://code.visualstudio.com/api/references/commands), [`extHostApiCommands.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostApiCommands.ts) (`Use 'default' to use VS Code's default text editor`).

Do **not** use `window.showTextDocument` when you need a specific custom editor — it always targets the standard text editor ([#98473](https://github.com/microsoft/vscode/issues/98473) guidance: use `vscode.openWith`).

### Suggested Packman commands

| Direction | `viewId` | When (editor title / keybinding) |
|---|---|---|
| UI → Edit | `'default'` | `activeCustomEditorId == 'packman.packageJson'` |
| Edit → UI | `'packman.packageJson'` | `resourceFilename == 'package.json' && activeCustomEditorId != 'packman.packageJson'` (or equivalent) |

Context key `activeCustomEditorId`: *“The id of the currently active custom editor.”*  
Source: [when-clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts).

Wire:

- `contributes.commands` — e.g. `packman.openEditMode` / `packman.openUiMode` (or one toggle that branches on `activeCustomEditorId`)
- `contributes.menus` → `editor/title` (+ icons)
- `contributes.keybindings` with matching `when` clauses

Users also get **View: Reopen Editor With…** / explorer **Open With…** for free ([fileActions.contribution.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/fileActions.contribution.ts)).

### Same-tab replace behavior

`vscode.openWith` opens with `override: id` and typically **replaces** the editor in the target group (pinned). The previous custom-editor webview is **disposed** (`WebviewPanel.onDidDispose`). Returning to UI mode runs `resolveCustomTextEditor` again on a **new** webview. File content continuity comes from the shared `TextDocument`, not from keeping the webview alive.

## Retain / revert / sync behaviors

### Sync (Custom Text Editor)

| Direction | Mechanism |
|---|---|
| Webview → disk model | `WorkspaceEdit` + `workspace.applyEdit` on the `TextDocument` |
| Disk model → webview | `workspace.onDidChangeTextDocument` → `postMessage` (filter same URI; avoid echo loops) |

Docs stress: undo/redo/revert/other editors/extensions all mutate the same `TextDocument`; webviews must refresh. Invalid JSON must be handled gracefully.  
Source: [Synchronizing changes with the TextDocument](https://code.visualstudio.com/api/extension-guides/custom-editors).

**Toggle implication:** unsaved edits made in UI mode remain on the `TextDocument` when switching to Edit mode (and vice versa), as long as the document stays open/dirty in the workbench — both modes share one text model.

### Revert

| Provider | Revert |
|---|---|
| `CustomTextEditorProvider` | No custom hook — **File: Revert File** reverts the `TextDocument`; webview learns via `onDidChangeTextDocument` |
| `CustomEditorProvider` | Must implement `revertCustomDocument` and refresh all webviews |

Source: [`CustomEditorProvider.revertCustomDocument` in `vscode.d.ts`](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts).

### `retainContextWhenHidden`

Set via `registerCustomEditorProvider(..., { webviewOptions: { retainContextWhenHidden: true } })` ([#109205](https://github.com/microsoft/vscode/issues/109205), [`registerCustomEditorProvider` options](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts)).

| Situation | Effect |
|---|---|
| Custom editor stays open but loses visibility (another tab / group focus) | Webview DOM/JS kept alive (high memory cost) |
| `openWith` replaces custom editor with text (Packman Edit toggle) | Panel **disposed** — retain does **not** preserve UI across the toggle |

Webview guide: prefer `getState` / `setState` over retain for persistable UI; retain is for complex state that cannot be quickly restored ([Webview — retainContextWhenHidden](https://code.visualstudio.com/api/extension-guides/webview)).

**Packman recommendation:**

1. Sync all **file** state through `TextDocument` (source of truth).
2. Persist cheap UI chrome (scroll, expanded sections) with webview `getState`/`setState` and/or extension `workspaceState` keyed by URI if needed across dispose.
3. Enable `retainContextWhenHidden` only if hiding-without-dispose is common and rebuild cost is painful — not as the Edit-mode toggle mechanism.

## Cursor compatibility

| Fact | Source |
|---|---|
| Cursor installs third-party extensions via **Open VSX** (+ marketplace proxy) | [Cursor — Extensions](https://cursor.com/help/customization/extensions) |
| Extension surface is the **VS Code Extension API** (custom editors included) | Same API docs; Cursor is a VS Code–compatible host |
| Host **lags** upstream `engines.vscode` (community reports ~1.105.x while VS Code moves ahead) | [Cursor forum — API base](https://forum.cursor.com/t/request-upgrade-vs-code-extension-api-base-beyond-1-105-1/164443), staff note on engine gates ([Open VSX versioning thread](https://forum.cursor.com/t/cursor-marketplace-installs-offers-outdated-version-of-open-vsx-extension-despite-latest-version-being-available-upstream/159718)) |
| Known Cursor bug: custom editors / Markdown preview can fail on **AI-created** files until opened once in the text editor | [Assertion error … custom editors](https://forum.cursor.com/t/assertion-error-when-using-custom-editors-incl-markdown-preview-editors/148578/1) |

**Packman shipping checklist for dual host:**

- Implement against stable custom text editor APIs (no proposed APIs required for this UX).
- Publish to **Open VSX** (and Marketplace if desired) with a conservative `engines.vscode`.
- Treat Edit mode (`openWith` → `'default'`) as the escape hatch for Cursor edge cases (AI files, association overrides).

## Recommended Packman pattern (checklist)

1. `CustomTextEditorProvider` + `registerCustomEditorProvider('packman.packageJson', …)`.
2. `customEditors` contribution: `**/package.json`, `priority: "default"`.
3. Commands: `openWith(uri, 'default')` / `openWith(uri, 'packman.packageJson')` + `editor/title` button + keybinding + `when` on `activeCustomEditorId` / `resourceFilename`.
4. Apply edits with `WorkspaceEdit`; refresh from `onDidChangeTextDocument`; handle invalid JSON.
5. Do not implement binary custom-document save/backup/revert.
6. Optional: `retainContextWhenHidden` for hide-without-dispose only; persist UI state separately for toggle.
7. Target VS Code + Cursor via Open VSX; keep engine range compatible with Cursor’s VS Code base.

## Sources

- [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Built-in Commands (`vscode.openWith`)](https://code.visualstudio.com/api/references/commands)
- [Contribution points (`customEditors`, `configurationDefaults`, `menus`)](https://code.visualstudio.com/api/references/contribution-points)
- [When clause contexts (`activeCustomEditorId`)](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Webview guide (`getState` / `setState` / `retainContextWhenHidden`)](https://code.visualstudio.com/api/extension-guides/webview)
- [vscode.d.ts — custom editor types](https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.d.ts)
- [extHostApiCommands — `vscode.openWith`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostApiCommands.ts)
- [editorResolverService — `workbench.editorAssociations`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/editor/common/editorResolverService.ts)
- [vscode-extension-samples / custom-editor-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/custom-editor-sample)
- [Cursor Extensions help](https://cursor.com/help/customization/extensions)
