# Packman

A VS Code / Cursor extension that opens `package.json` in a native-feeling UI, with script runners and dependency intelligence.

## Language

**Packman**:
The VS Code / Cursor extension (and its custom editor) for viewing and acting on a `package.json`.
_Avoid_: the viewer, the panel, package UI

**UI mode**:
Packman's visual, read-oriented presentation of a `package.json`; the default when a `package.json` opens.
_Avoid_: preview mode, view mode, read-only mode

**Edit mode**:
The native VS Code text editor for the same `package.json`, entered from Packman via a control or keybinding.
_Avoid_: form edit, structured edit, raw mode

**Script button**:
A control in UI mode bound to one `scripts` entry that opens/uses a terminal and runs that script via the detected package manager.
_Avoid_: task, npm script launcher

**Dependency row**:
One installable package entry from `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`, shown with enrichment columns (registry / GitHub / Socket).
_Avoid_: package line, module row

**Override entry**:
A `overrides` or `resolutions` mapping shown apart from Dependency rows; not treated as an installable Dependency row.
_Avoid_: dependency override row
