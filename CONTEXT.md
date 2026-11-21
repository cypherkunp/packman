# Packman

A VS Code / Cursor extension that adds script runners and dependency intelligence to `package.json`, directly in the text editor.

## Language

**Packman**:
The VS Code / Cursor extension for viewing and acting on a `package.json`, through the Overlay and UI mode.
_Avoid_: the viewer, the panel, package UI

**Overlay**:
The set of Packman annotations attached to a `package.json` in the text editor: run actions on scripts, dependency signals, and per-block summaries. The default way Packman appears.
_Avoid_: lens mode, inline mode, annotations, edit mode

**UI mode**:
Packman's opt-in visual, read-oriented presentation of a `package.json` as a separate view; reached from the text editor via a control or keybinding.
_Avoid_: preview mode, view mode, read-only mode

**Script button**:
A control in the Overlay or UI mode bound to one `scripts` entry that opens/uses a terminal and runs that script via the detected package manager.
_Avoid_: task, npm script launcher

**Dependency**:
One installable package entry from `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`. Its enrichment (latest version, GitHub repo, open issues, Socket) belongs to the Dependency, whichever surface shows it.
_Avoid_: dependency row, dependency line, package line, module row

**Override entry**:
A `overrides` or `resolutions` mapping shown apart from Dependencies; not treated as a Dependency and not enriched.
_Avoid_: dependency override row

## Retired terms

**Edit mode**: formerly the native text editor as entered from UI mode. The text editor is now the default surface and carries the Overlay; call it "the text editor".

**Dependency row**: renamed to **Dependency**; enrichment is no longer tied to a table row.
