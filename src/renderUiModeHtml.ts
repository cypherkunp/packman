import { parsePackageDocument } from "./parsePackageDocument";
import type {
  CellDegrade,
  EnrichedDependencyRow,
} from "./enrichDependencyRow";
import {
  type DependencyBag,
  type PackageViewModel,
  toPackageViewModel,
} from "./packageViewModel";
import { npmPackageUrl } from "./fetchNpmLatest";
import { dependencyStatus, type DependencyStatus } from "./dependencyStatus";

export type EnrichmentByName = ReadonlyMap<string, EnrichedDependencyRow>;

export type UiModeExtras = {
  /** Local clock label for when GitHub issue counts resume, e.g. "18:42". */
  githubResetLabel?: string;
  /** True while registry / GitHub / Socket data is being fetched. */
  loading?: boolean;
  /** Keybinding label for Edit mode, e.g. "⌘⇧M" or "Ctrl+Shift+M". */
  editShortcut?: string;
};

/** Full webview document. Use once per webview load; patch with `renderUiModeBody`. */
export function renderUiModeHtml(
  documentText: string,
  nonce: string,
  enrichmentByName: EnrichmentByName = new Map(),
  extras?: UiModeExtras,
): string {
  return shell(
    nonce,
    renderUiModeBody(documentText, enrichmentByName, extras),
  );
}

/** Markup for the `<main id="app">` contents, posted to a live webview. */
export function renderUiModeBody(
  documentText: string,
  enrichmentByName: EnrichmentByName = new Map(),
  extras?: UiModeExtras,
): string {
  const parsed = parsePackageDocument(documentText);
  if (!parsed.ok) {
    return errorBody(parsed.error, documentText, extras);
  }
  return packageBody(
    toPackageViewModel(parsed.value),
    enrichmentByName,
    extras,
  );
}

function shell(nonce: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Packman</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --col-gap: 1.5rem;
      --cell-x: 0.75rem;
      --radius: 4px;
      --hairline: var(--vscode-widget-border, var(--vscode-panel-border, transparent));
      --muted: var(--vscode-descriptionForeground);
      --data-font: var(--vscode-editor-font-family, ui-monospace, monospace);
    }
    body {
      margin: 0;
      padding: 1.25rem 1.5rem 3rem;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    ::selection {
      background: var(--vscode-editor-selectionBackground);
    }
    main {
      max-width: 60rem;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Masthead */
    .masthead {
      margin-bottom: 1.75rem;
    }
    .title-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
    }
    h1 {
      font-size: 1.35em;
      font-weight: 600;
      margin: 0;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
      min-width: 0;
    }
    h1 .version {
      font-weight: 400;
      color: var(--muted);
    }
    .description {
      margin: 0.4rem 0 0;
      max-width: 70ch;
    }
    .status {
      margin: 0.4rem 0 0;
      color: var(--muted);
      min-height: 1.45em;
    }
    .status:empty {
      min-height: 0;
      margin: 0;
    }
    .actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    button.action {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.25rem 0.65rem;
      border: 1px solid var(--vscode-button-border, var(--hairline));
      border-radius: var(--radius);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font: inherit;
      cursor: pointer;
      transition: background 120ms ease-out;
    }
    button.action:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }
    kbd {
      font-family: inherit;
      font-size: 0.85em;
      padding: 0 0.3em;
      border-radius: 3px;
      border: 1px solid var(--vscode-keybindingLabel-border, var(--hairline));
      border-bottom-color: var(--vscode-keybindingLabel-bottomBorder, var(--vscode-keybindingLabel-border, var(--hairline)));
      background: var(--vscode-keybindingLabel-background, transparent);
      color: var(--vscode-keybindingLabel-foreground, inherit);
      line-height: 1.4;
    }

    /* Sections */
    .section {
      margin-bottom: 2rem;
    }
    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.25rem 0.75rem;
      margin: 0 0 0.6rem;
    }
    h2 {
      font-size: 0.875em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin: 0;
    }
    h2 .count {
      font-weight: 400;
      margin-left: 0.35em;
    }
    .attention {
      color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
      font-weight: 600;
    }
    .all-clear {
      color: var(--muted);
    }

    /* Key/value lists */
    dl {
      display: grid;
      grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr);
      gap: 0.55rem var(--col-gap);
      margin: 0;
      align-items: baseline;
    }
    dt {
      color: var(--muted);
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0;
      min-width: 0;
      font-family: var(--data-font);
      overflow-wrap: anywhere;
    }
    .pairs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1.25rem;
    }
    .pairs .key {
      color: var(--muted);
      margin-right: 0.4em;
    }

    /* Code */
    pre.code-block {
      margin: 0;
      padding: 0.55rem 0.75rem;
      border-radius: var(--radius);
      border: 1px solid var(--hairline);
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      color: var(--vscode-editor-foreground);
      overflow-x: auto;
      max-width: 100%;
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
      tab-size: 2;
      user-select: text;
      font-family: var(--data-font);
      font-size: var(--vscode-editor-font-size, 0.9em);
      line-height: 1.45;
    }
    pre.code-block code {
      font: inherit;
      color: inherit;
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
    }
    .tok-key { color: var(--vscode-symbolIcon-keyForeground, var(--vscode-editor-foreground)); }
    .tok-string { color: var(--vscode-debugTokenExpression-string, var(--vscode-symbolIcon-stringForeground)); }
    .tok-number { color: var(--vscode-debugTokenExpression-number, var(--vscode-symbolIcon-numberForeground)); }
    .tok-boolean { color: var(--vscode-debugTokenExpression-boolean, var(--vscode-symbolIcon-booleanForeground)); }
    .tok-null { color: var(--vscode-symbolIcon-nullForeground, var(--vscode-debugTokenExpression-boolean)); }

    details.field {
      border-top: 1px solid var(--hairline);
    }
    details.field:last-child {
      border-bottom: 1px solid var(--hairline);
    }
    details.field > summary {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.45rem 0.25rem;
      cursor: pointer;
      list-style: none;
    }
    details.field > summary::-webkit-details-marker {
      display: none;
    }
    /* Drawn chevron: points right when closed, down when open. */
    details.field > summary::before {
      content: "";
      flex: none;
      align-self: center;
      width: 0.4em;
      height: 0.4em;
      margin: 0 0.15rem 0 0.2rem;
      border-right: 1.5px solid var(--muted);
      border-bottom: 1.5px solid var(--muted);
      transform: rotate(-45deg);
      transition: transform 120ms ease-out;
    }
    details.field[open] > summary::before {
      transform: rotate(45deg);
    }
    details.field > summary .key {
      font-family: var(--data-font);
    }
    details.field > summary .shape {
      color: var(--muted);
    }
    details.field > summary:hover {
      background: var(--vscode-list-hoverBackground);
    }
    details.field > pre.code-block {
      margin: 0 0 0.6rem;
    }
    .other-scalars {
      margin-bottom: 1rem;
    }

    /* Script buttons */
    .scripts {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    button.script-button {
      appearance: none;
      display: flex;
      align-items: baseline;
      gap: var(--col-gap);
      width: 100%;
      text-align: left;
      border: 1px solid var(--vscode-button-border, var(--hairline));
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      box-sizing: border-box;
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      cursor: pointer;
      font: inherit;
      transition: background 120ms ease-out, border-color 120ms ease-out, transform 80ms ease-out;
    }
    button.script-button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }
    button.script-button:active {
      transform: scale(0.99);
    }
    button.script-button[aria-disabled="true"] {
      cursor: progress;
      border-color: var(--vscode-focusBorder);
    }
    button.script-button .name {
      font-weight: 600;
      flex: 0 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    button.script-button .cmd {
      margin-left: auto;
      color: var(--muted);
      font-family: var(--data-font);
      font-size: 0.92em;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    button.script-button .started {
      display: none;
      margin-left: auto;
      color: var(--vscode-foreground);
      white-space: nowrap;
    }
    button.script-button[aria-disabled="true"] .cmd {
      display: none;
    }
    button.script-button[aria-disabled="true"] .started {
      display: inline;
    }

    /* Notices */
    .notice {
      margin: 0 0 1.25rem;
      padding: 0.55rem 0.75rem;
      border-radius: var(--radius);
      border: 1px solid var(--vscode-inputValidation-warningBorder, var(--hairline));
      background: var(--vscode-inputValidation-warningBackground, transparent);
      color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
      max-width: 70ch;
    }
    .hint {
      margin: 0 0 1.25rem;
      color: var(--muted);
    }

    /* Tables */
    .table-wrap {
      container-type: inline-size;
      border: 1px solid var(--hairline);
      border-radius: var(--radius);
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    table.deps {
      table-layout: fixed;
    }
    col.c-range { width: 7.5em; }
    col.c-latest { width: 10.5em; }
    col.c-github { width: 6em; }
    col.c-issues { width: 7.5em; }
    col.c-socket { width: 9em; }
    th, td {
      padding: 0.45rem 0 0.45rem var(--cell-x);
      border-bottom: 1px solid var(--hairline);
      vertical-align: baseline;
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th:first-child, td:first-child {
      padding-left: var(--cell-x);
      text-align: left;
      white-space: normal;
      overflow-wrap: break-word;
    }
    th:last-child, td:last-child {
      padding-right: var(--cell-x);
    }
    td {
      font-family: var(--data-font);
      font-size: var(--vscode-editor-font-size, 1em);
    }
    tbody tr:last-child > * {
      border-bottom: none;
    }
    thead th {
      font-weight: 600;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-inactiveSelectionBackground, transparent);
    }
    tbody th {
      font-weight: 400;
      font-family: var(--data-font);
      font-size: var(--vscode-editor-font-size, 1em);
    }
    tr.needs-attention > th:first-child {
      font-weight: 600;
    }
    .muted {
      color: var(--muted);
    }
    .gap {
      margin-left: 0.4em;
      color: var(--muted);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .gap.breaking {
      color: var(--vscode-editorWarning-foreground, var(--vscode-foreground));
      font-weight: 600;
    }
    .alert-label {
      margin-left: 0.35em;
      color: var(--vscode-errorForeground);
      font-weight: 600;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .of {
      color: var(--muted);
    }

    /* Narrow editor groups: one dependency per block, details on a wrapped line. */
    @container (max-width: 46rem) {
      table.deps, table.deps tbody, table.deps tr, table.deps td, table.deps tbody th {
        display: block;
      }
      table.deps colgroup, table.deps thead {
        display: none;
      }
      table.deps tr {
        padding: 0.5rem var(--cell-x);
        border-bottom: 1px solid var(--hairline);
      }
      table.deps tbody tr:last-child {
        border-bottom: none;
      }
      table.deps tbody th, table.deps td {
        padding: 0;
        border: none;
        text-align: left;
        white-space: normal;
      }
      table.deps tr > td {
        display: inline-block;
        margin: 0.2rem 1.1rem 0 0;
      }
      table.deps td::before {
        content: attr(data-label);
        color: var(--muted);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        margin-right: 0.4em;
      }
    }

    /* Links and focus */
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      text-underline-offset: 0.18em;
    }
    a:hover {
      color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground));
      text-decoration: underline;
    }
    a:focus-visible, button:focus-visible, summary:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    a:focus-visible {
      border-radius: 2px;
    }

    /* Error and empty states */
    .problem {
      max-width: 70ch;
    }
    .problem h1 {
      margin-bottom: 0.6rem;
    }
    .problem p {
      margin: 0 0 0.75rem;
    }
    .problem .detail {
      font-family: var(--data-font);
      color: var(--vscode-errorForeground);
      overflow-wrap: anywhere;
    }
    .empty {
      color: var(--muted);
      margin: 0 0 1.5rem;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
      }
      button.script-button:active {
        transform: none;
      }
    }
  </style>
</head>
<body>
<main id="app">
${body}
</main>
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");

  function announce(text) {
    const status = document.getElementById("live-status");
    if (status) status.textContent = text;
  }

  document.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const script = target.closest("button.script-button");
    if (script instanceof HTMLButtonElement) {
      if (script.getAttribute("aria-disabled") === "true") return;
      const name = script.getAttribute("data-script");
      if (!name) return;
      vscode.postMessage({ type: "runScript", script: name });
      script.setAttribute("aria-disabled", "true");
      announce("Started " + name + " in the Packman terminal.");
      setTimeout(function () {
        script.removeAttribute("aria-disabled");
      }, 1500);
      return;
    }

    const action = target.closest("[data-action]");
    if (action instanceof HTMLElement) {
      const kind = action.getAttribute("data-action");
      if (kind === "edit") {
        const line = Number(action.getAttribute("data-line") || 0);
        const column = Number(action.getAttribute("data-column") || 0);
        vscode.postMessage({ type: "openEditMode", line: line, column: column });
      } else if (kind === "refresh") {
        vscode.postMessage({ type: "refresh" });
      }
    }
  });

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message || message.type !== "render" || typeof message.html !== "string") return;

    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement ? active.getAttribute("data-key") : null;
    const open = new Set();
    document.querySelectorAll("details[open][data-key]").forEach(function (el) {
      open.add(el.getAttribute("data-key"));
    });
    const started = new Set();
    document.querySelectorAll('button.script-button[aria-disabled="true"]').forEach(function (el) {
      started.add(el.getAttribute("data-script"));
    });

    app.innerHTML = message.html;

    document.querySelectorAll("details[data-key]").forEach(function (el) {
      if (open.has(el.getAttribute("data-key"))) el.setAttribute("open", "");
    });
    document.querySelectorAll("button.script-button").forEach(function (el) {
      if (started.has(el.getAttribute("data-script"))) {
        el.setAttribute("aria-disabled", "true");
        setTimeout(function () { el.removeAttribute("aria-disabled"); }, 1500);
      }
    });
    if (focusKey) {
      const next = document.querySelector('[data-key="' + CSS.escape(focusKey) + '"]');
      if (next instanceof HTMLElement) next.focus({ preventScroll: true });
    }
  });

  vscode.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
}

function masthead(
  title: string,
  version: string | undefined,
  description: string | undefined,
  extras: UiModeExtras | undefined,
  showRefresh: boolean,
): string {
  const shortcut = extras?.editShortcut
    ? ` <kbd>${escapeHtml(extras.editShortcut)}</kbd>`
    : "";
  const versionHtml = version
    ? `<span class="version">@${escapeHtml(version)}</span>`
    : "";
  const refresh = showRefresh
    ? `<button type="button" class="action" data-action="refresh" data-key="action-refresh" title="Fetch registry, GitHub and Socket data again">Refresh</button>`
    : "";
  const status = extras?.loading ? "Fetching registry, GitHub and Socket data…" : "";
  return `<header class="masthead">
  <div class="title-row">
    <h1>${escapeHtml(title)}${versionHtml}</h1>
    <div class="actions">${refresh}<button type="button" class="action" data-action="edit" data-key="action-edit" title="Open package.json in the text editor">Edit mode${shortcut}</button></div>
  </div>
  ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
  <p class="status" id="live-status" role="status" aria-live="polite">${status}</p>
</header>`;
}

function errorBody(
  error: string,
  documentText: string,
  extras: UiModeExtras | undefined,
): string {
  const position = errorPosition(error, documentText);
  const isSyntax = error.startsWith("Invalid JSON");
  const detail = isSyntax
    ? error
        .replace(/^Invalid JSON:\s*/, "")
        .replace(/\s*in JSON at position \d+(\s*\(line \d+ column \d+\))?/, "")
        .replace(/\s*at position \d+/, "")
    : "The top level of package.json must be a JSON object, like { \"name\": \"…\" }.";
  const where = position
    ? ` at line ${position.line}, column ${position.column}`
    : "";
  const shortcut = extras?.editShortcut
    ? ` <kbd>${escapeHtml(extras.editShortcut)}</kbd>`
    : "";
  const lineAttrs = position
    ? ` data-line="${position.line}" data-column="${position.column}"`
    : "";
  return `<section class="problem">
  <h1>package.json can’t be shown</h1>
  <p>${isSyntax ? "The file isn’t valid JSON" : "The file isn’t a package manifest"}, so UI mode can’t read it. Fix it in Edit mode; this view updates as soon as the file is valid.</p>
  <p class="detail">${escapeHtml(detail)}${escapeHtml(where)}</p>
  <p><button type="button" class="action" data-action="edit" data-key="action-edit"${lineAttrs}>Open in Edit mode${escapeHtml(where)}${shortcut}</button></p>
  <p class="status" id="live-status" role="status" aria-live="polite"></p>
</section>`;
}

function errorPosition(
  error: string,
  text: string,
): { line: number; column: number } | undefined {
  const lineColumn = error.match(/line (\d+) column (\d+)/);
  if (lineColumn) {
    return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
  }
  const offset = error.match(/position (\d+)/);
  if (!offset) {
    return undefined;
  }
  const before = text.slice(0, Number(offset[1]));
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

const BAG_LABELS: Record<DependencyBag, string> = {
  dependencies: "Dependencies",
  devDependencies: "Dev dependencies",
  peerDependencies: "Peer dependencies",
  optionalDependencies: "Optional dependencies",
};

function packageBody(
  model: PackageViewModel,
  enrichmentByName: EnrichmentByName,
  extras?: UiModeExtras,
): string {
  const identity = new Map(model.identity.map((field) => [field.key, field.value]));
  const name = typeof identity.get("name") === "string" ? String(identity.get("name")) : undefined;
  const version = typeof identity.get("version") === "string" ? String(identity.get("version")) : undefined;
  const description =
    typeof identity.get("description") === "string"
      ? String(identity.get("description"))
      : undefined;
  const hasDependencies = model.dependencyBags.length > 0;

  const parts: string[] = [
    masthead(name ?? "package.json", version, description, extras, hasDependencies),
  ];

  const details = model.identity.filter(
    (field) =>
      field.key !== "name" &&
      field.key !== "version" &&
      !(field.key === "description" && typeof field.value === "string"),
  );
  if (details.length > 0) {
    parts.push(`<section class="section" aria-labelledby="h-package"><div class="section-head"><h2 id="h-package">Package</h2></div><dl>`);
    for (const field of details) {
      parts.push(
        `<dt>${escapeHtml(field.key)}</dt><dd>${renderValue(field.value)}</dd>`,
      );
    }
    parts.push(`</dl></section>`);
  }

  if (model.scripts.length > 0) {
    parts.push(
      `<section class="section" aria-labelledby="h-scripts"><div class="section-head"><h2 id="h-scripts">Scripts<span class="count">${model.scripts.length}</span></h2></div><div class="scripts">`,
    );
    for (const script of model.scripts) {
      parts.push(
        `<button type="button" class="script-button" data-script="${escapeAttr(script.name)}" data-key="script-${escapeAttr(script.name)}" title="${escapeAttr(script.command)}" aria-label="Run ${escapeAttr(script.name)}: ${escapeAttr(script.command)}"><span class="name">${escapeHtml(script.name)}</span><span class="cmd">${escapeHtml(script.command)}</span><span class="started" aria-hidden="true">Started in terminal</span></button>`,
      );
    }
    parts.push(`</div></section>`);
  }

  if (!hasDependencies && model.scripts.length === 0) {
    parts.push(
      `<p class="empty">No scripts or dependencies yet. Add them in Edit mode and they appear here.</p>`,
    );
  }

  const rowsFor = (rowName: string, range: string): EnrichedDependencyRow =>
    enrichmentByName.get(rowName) ??
    ({ name: rowName, range, npmUrl: npmPackageUrl(rowName) } satisfies EnrichedDependencyRow);

  const allRows = model.dependencyBags.flatMap((bag) =>
    bag.rows.map((row) => rowsFor(row.name, row.range)),
  );
  const socketOff =
    allRows.length > 0 && allRows.every((row) => row.socket?.kind === "cta");
  const showSocket = !socketOff;

  model.dependencyBags.forEach((bag, index) => {
    const label = BAG_LABELS[bag.bag];
    const id = `h-${bag.bag}`;
    const rows = bag.rows.map((row) => rowsFor(row.name, row.range));
    const statuses = rows.map((row) => ({
      row,
      status: dependencyStatus(row.range, row.latest),
    }));
    const attention = statuses.filter(({ row, status }) =>
      needsAttention(row, status),
    ).length;
    const summary = extras?.loading
      ? ""
      : attention > 0
        ? `<span class="attention">${attention} ${attention === 1 ? "needs" : "need"} attention</span>`
        : rows.some((row) => row.latest)
          ? `<span class="all-clear">All within range</span>`
          : "";

    parts.push(
      `<section class="section" aria-labelledby="${id}"><div class="section-head"><h2 id="${id}">${label}<span class="count">${rows.length}</span></h2>${summary}</div>`,
    );
    if (index === 0) {
      if (githubRateLimitNotice(enrichmentByName)) {
        parts.push(githubNoticeHtml(extras?.githubResetLabel));
      }
      if (socketOff) {
        parts.push(
          `<p class="hint">Socket risk scores are off. <a href="command:packman.openSocketSettings">Set Socket token</a> to show them.</p>`,
        );
      }
    }
    parts.push(`<div class="table-wrap">`);
    parts.push(
      `<table class="deps"><caption class="sr-only">${label}</caption><colgroup><col class="c-name"><col class="c-range"><col class="c-latest"><col class="c-github"><col class="c-issues">${showSocket ? `<col class="c-socket">` : ""}</colgroup><thead><tr><th scope="col">Package</th><th scope="col">Range</th><th scope="col">Latest</th><th scope="col">GitHub</th><th scope="col" title="Open issues and pull requests on GitHub">Issues + PRs</th>${showSocket ? `<th scope="col" title="Socket.dev supply-chain score, 0–100">Socket</th>` : ""}</tr></thead><tbody>`,
    );
    for (const { row, status } of statuses) {
      parts.push(dependencyRowHtml(row, status, showSocket, extras?.loading === true));
    }
    parts.push(`</tbody></table></div></section>`);
  });

  if (model.overrides.length > 0) {
    parts.push(
      `<section class="section" aria-labelledby="h-overrides"><div class="section-head"><h2 id="h-overrides">Overrides<span class="count">${model.overrides.length}</span></h2></div>`,
    );
    parts.push(`<div class="table-wrap">`);
    parts.push(
      `<table><caption class="sr-only">Overrides</caption><thead><tr><th scope="col">Package</th><th scope="col">Forced version</th></tr></thead><tbody>`,
    );
    for (const entry of model.overrides) {
      parts.push(
        `<tr><th scope="row">${escapeHtml(entry.key)}</th><td>${escapeHtml(entry.target)}</td></tr>`,
      );
    }
    parts.push(`</tbody></table></div></section>`);
  }

  if (model.generic.length > 0) {
    const scalars = model.generic.filter((field) => !isStructured(field.value));
    const structured = model.generic.filter((field) => isStructured(field.value));
    parts.push(
      `<section class="section" aria-labelledby="h-other"><div class="section-head"><h2 id="h-other">Other fields<span class="count">${model.generic.length}</span></h2></div>`,
    );
    if (scalars.length > 0) {
      parts.push(`<dl class="other-scalars">`);
      for (const field of scalars) {
        parts.push(
          `<dt>${escapeHtml(field.key)}</dt><dd>${renderValue(field.value)}</dd>`,
        );
      }
      parts.push(`</dl>`);
    }
    for (const field of structured) {
      parts.push(
        `<details class="field" data-key="field-${escapeAttr(field.key)}"><summary data-key="summary-${escapeAttr(field.key)}"><span class="key">${escapeHtml(field.key)}</span><span class="shape">${escapeHtml(shapeLabel(field.value))}</span></summary>${codeBlock(field.value)}</details>`,
      );
    }
    parts.push(`</section>`);
  }

  return parts.join("\n");
}

function needsAttention(
  row: EnrichedDependencyRow,
  status: DependencyStatus,
): boolean {
  return (
    (status.kind === "behind" && status.breaking) ||
    (row.socket?.kind === "score" && row.socket.highSeverity)
  );
}

const NOT_AVAILABLE = `<span class="muted" aria-hidden="true">—</span><span class="sr-only">not available</span>`;
const LOADING = `<span class="muted" aria-hidden="true">…</span><span class="sr-only">loading</span>`;

function dependencyRowHtml(
  row: EnrichedDependencyRow,
  status: DependencyStatus,
  showSocket: boolean,
  loading: boolean,
): string {
  const name = escapeHtml(row.name);
  const empty = loading ? LOADING : NOT_AVAILABLE;
  const nameCell = `<a href="${escapeAttr(row.npmUrl)}" title="Open ${escapeAttr(row.name)} on npm" data-key="npm-${escapeAttr(row.name)}">${name}</a>`;

  let latestCell: string;
  if (status.kind === "non-registry") {
    latestCell = `<span class="muted" title="Resolved from ${escapeAttr(status.source)}, not the npm registry">${escapeHtml(status.source)}</span>`;
  } else if (row.latestDegrade && !row.latest) {
    latestCell = degradeText(row.latestDegrade);
  } else if (row.latest) {
    latestCell = `${escapeHtml(row.latest)}${gapLabel(status)}`;
  } else {
    latestCell = empty;
  }

  const githubCell = row.githubUrl
    ? `<a href="${escapeAttr(row.githubUrl)}" aria-label="${escapeAttr(row.name)} repository on GitHub" data-key="gh-${escapeAttr(row.name)}">repo</a>`
    : row.githubDegrade
      ? degradeText(row.githubDegrade)
      : status.kind === "non-registry"
        ? NOT_AVAILABLE
        : empty;

  let issuesCell: string;
  if (row.openIssuesCount !== undefined && row.issuesUrl) {
    issuesCell = `<a href="${escapeAttr(row.issuesUrl)}" title="Open issues and pull requests on GitHub" aria-label="${escapeAttr(`${row.name}: ${row.openIssuesCount} open issues and pull requests`)}" data-key="issues-${escapeAttr(row.name)}">${row.openIssuesCount.toLocaleString("en-US")}</a>`;
  } else if (row.issuesDegrade === "rate_limited") {
    issuesCell = `<span class="muted" title="Paused by the GitHub rate limit. The repo link still works.">paused</span>`;
  } else if (row.issuesDegrade) {
    issuesCell = degradeText(row.issuesDegrade);
  } else if (!row.githubUrl && !loading) {
    issuesCell = NOT_AVAILABLE;
  } else {
    issuesCell = empty;
  }

  const socketCell = showSocket ? socketCellHtml(row, empty) : "";
  const rowClass = needsAttention(row, status) ? ` class="needs-attention"` : "";
  return `<tr${rowClass}><th scope="row">${nameCell}</th><td data-label="Range" title="${escapeAttr(row.range)}">${escapeHtml(row.range)}</td><td data-label="Latest">${latestCell}</td><td data-label="GitHub">${githubCell}</td><td data-label="Issues + PRs">${issuesCell}</td>${showSocket ? `<td data-label="Socket">${socketCell}</td>` : ""}</tr>`;
}

function gapLabel(status: DependencyStatus): string {
  if (status.kind !== "behind") {
    return "";
  }
  const title = status.breaking
    ? "Latest is outside your range and may contain breaking changes"
    : "Latest is outside your range";
  return `<span class="gap${status.breaking ? " breaking" : ""}" title="${title}">${status.gap}</span>`;
}

function degradeText(kind: CellDegrade): string {
  const labels: Record<CellDegrade, [string, string]> = {
    rate_limited: ["paused", "Paused by the GitHub rate limit"],
    offline: ["offline", "Couldn’t reach the network. Refresh to try again."],
    timeout: ["timed out", "The request took too long. Refresh to try again."],
  };
  const [label, title] = labels[kind];
  return `<span class="muted" title="${escapeAttr(title)}">${label}</span>`;
}

function githubRateLimitNotice(enrichmentByName: EnrichmentByName): boolean {
  for (const row of enrichmentByName.values()) {
    if (row.issuesDegrade === "rate_limited") {
      return true;
    }
  }
  return false;
}

function githubNoticeHtml(resetLabel: string | undefined): string {
  const when = resetLabel ? ` until ${escapeHtml(resetLabel)}` : "";
  return `<p class="notice" role="note">GitHub rate limit reached: issue counts are paused${when}. Repo links still work. Sign in to GitHub when VS Code asks, or <a href="command:packman.openGithubSettings">set a token</a> for 5,000 requests an hour instead of 60.</p>`;
}

function socketCellHtml(row: EnrichedDependencyRow, empty: string): string {
  const socket = row.socket;
  if (!socket) {
    return empty;
  }
  if (socket.kind === "empty") {
    return NOT_AVAILABLE;
  }
  if (socket.kind === "cta") {
    return `<a href="command:packman.openSocketSettings" aria-label="Set a Socket token to show ${escapeAttr(row.name)}’s score">Set token</a>`;
  }
  const alert = socket.highSeverity
    ? `<span class="alert-label socket-high" title="Socket reports high or critical alerts for this version">alerts</span>`
    : "";
  const label = `${row.name}: Socket score ${socket.overall100} out of 100${socket.highSeverity ? ", with high or critical alerts" : ""}`;
  return `<a href="${escapeAttr(socket.url)}" aria-label="${escapeAttr(label)}" title="Open the Socket report" data-key="socket-${escapeAttr(row.name)}">${socket.overall100}<span class="of">/100</span></a>${alert}`;
}

function isStructured(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function shapeLabel(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  const keys = Object.keys(value as object).length;
  return `${keys} ${keys === 1 ? "key" : "keys"}`;
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return `<span class="scalar">${escapeHtml(value)}</span>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<span class="scalar">${escapeHtml(String(value))}</span>`;
  }
  if (value === null) {
    return `<span class="scalar">null</span>`;
  }
  if (isFlatStringRecord(value)) {
    const pairs = Object.entries(value).map(
      ([key, text]) =>
        `<span><span class="key">${escapeHtml(key)}</span>${escapeHtml(text)}</span>`,
    );
    return `<span class="pairs">${pairs.join("")}</span>`;
  }
  return codeBlock(value);
}

function isFlatStringRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const entries = Object.values(value);
  return (
    entries.length > 0 &&
    entries.length <= 6 &&
    entries.every((entry) => typeof entry === "string" && entry.length <= 40)
  );
}

function codeBlock(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  return `<pre class="code-block"><code>${highlightJson(json)}</code></pre>`;
}

const JSON_TOKEN =
  /"(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlightJson(json: string): string {
  let html = "";
  let last = 0;
  for (const match of json.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    html += escapeHtml(json.slice(last, index));
    html += colorJsonToken(match[0]);
    last = index + match[0].length;
  }
  html += escapeHtml(json.slice(last));
  return html;
}

function colorJsonToken(token: string): string {
  if (token.startsWith('"')) {
    const split = token.match(/^("(?:\\.|[^"\\])*")(\s*:)?$/);
    if (split?.[2] !== undefined) {
      return `<span class="tok-key">${escapeHtml(split[1] ?? "")}</span>${escapeHtml(split[2])}`;
    }
    return `<span class="tok-string">${escapeHtml(token)}</span>`;
  }
  if (token === "true" || token === "false") {
    return `<span class="tok-boolean">${token}</span>`;
  }
  if (token === "null") {
    return `<span class="tok-null">${token}</span>`;
  }
  return `<span class="tok-number">${escapeHtml(token)}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replaceAll("'", "&#39;");
}
