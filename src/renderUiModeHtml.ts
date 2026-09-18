import { parsePackageDocument } from "./parsePackageDocument";
import type { EnrichedDependencyRow } from "./enrichDependencyRow";
import {
  type PackageViewModel,
  toPackageViewModel,
} from "./packageViewModel";
import { npmPackageUrl } from "./fetchNpmLatest";

export type EnrichmentByName = ReadonlyMap<string, EnrichedDependencyRow>;

export function renderUiModeHtml(
  documentText: string,
  nonce: string,
  enrichmentByName: EnrichmentByName = new Map(),
): string {
  const parsed = parsePackageDocument(documentText);
  if (!parsed.ok) {
    return shell(nonce, errorBody(parsed.error));
  }
  return shell(
    nonce,
    packageBody(toPackageViewModel(parsed.value), enrichmentByName),
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
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 1.25rem 1.5rem 2.5rem;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    main {
      max-width: 56rem;
    }
    h1 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 1.25rem;
      letter-spacing: -0.01em;
    }
    h2 {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      margin: 0 0 0.65rem;
    }
    .section {
      margin-bottom: 1.75rem;
    }
    dl {
      display: grid;
      grid-template-columns: minmax(7rem, max-content) 1fr;
      gap: 0.55rem 1.25rem;
      margin: 0;
      align-items: start;
    }
    dt {
      color: var(--vscode-descriptionForeground);
      padding-top: 0.15rem;
    }
    dd {
      margin: 0;
      min-width: 0;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      word-break: break-word;
    }
    pre.code-block {
      margin: 0;
      padding: 0.55rem 0.7rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: 0.9em;
      line-height: 1.4;
    }
    pre.code-block code {
      font: inherit;
      color: inherit;
      white-space: pre;
    }
    .scripts {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      align-items: stretch;
    }
    button.script-button {
      appearance: none;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      text-align: left;
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font: inherit;
      transition: background 120ms ease-out, border-color 120ms ease-out, transform 80ms ease-out;
    }
    button.script-button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }
    button.script-button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    button.script-button:active {
      transform: scale(0.99);
    }
    button.script-button .name {
      font-weight: 600;
      flex-shrink: 0;
    }
    button.script-button .cmd {
      opacity: 0.72;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
      font-size: 0.9em;
      text-align: right;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 0.95em;
    }
    th, td {
      text-align: left;
      padding: 0.45rem 0.7rem;
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      vertical-align: top;
    }
    tr:last-child td {
      border-bottom: none;
    }
    th {
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
      font-size: 0.85em;
      background: var(--vscode-editor-inactiveSelectionBackground, transparent);
    }
    td.muted, .muted {
      color: var(--vscode-descriptionForeground);
      opacity: 0.75;
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .socket-high {
      color: var(--vscode-errorForeground);
      font-weight: 700;
      margin-left: 0.15rem;
    }
    .error-cell {
      color: var(--vscode-errorForeground);
      opacity: 0.85;
    }
    .error {
      color: var(--vscode-errorForeground);
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
${body}
<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  document.addEventListener("click", function (event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button.script-button");
    if (!(button instanceof HTMLButtonElement)) return;
    const script = button.getAttribute("data-script");
    if (!script) return;
    vscode.postMessage({ type: "runScript", script: script });
  });
})();
</script>
</body>
</html>`;
}

function errorBody(message: string): string {
  return `<main>
  <h1>Packman</h1>
  <p class="error">${escapeHtml(message)}</p>
</main>`;
}

function packageBody(
  model: PackageViewModel,
  enrichmentByName: EnrichmentByName,
): string {
  const parts: string[] = [`<main>`, `<h1>Packman</h1>`];

  if (model.identity.length > 0) {
    parts.push(`<section class="section"><h2>Package</h2>`);
    parts.push(`<dl>`);
    for (const field of model.identity) {
      parts.push(
        `<dt>${escapeHtml(field.key)}</dt><dd>${renderValue(field.value)}</dd>`,
      );
    }
    parts.push(`</dl></section>`);
  }

  if (model.scripts.length > 0) {
    parts.push(`<section class="section"><h2>Scripts</h2><div class="scripts">`);
    for (const script of model.scripts) {
      parts.push(
        `<button type="button" class="script-button" data-script="${escapeAttr(script.name)}" title="Run ${escapeAttr(script.name)}"><span class="name">${escapeHtml(script.name)}</span><span class="cmd">${escapeHtml(script.command)}</span></button>`,
      );
    }
    parts.push(`</div></section>`);
  }

  for (const bag of model.dependencyBags) {
    parts.push(
      `<section class="section"><h2>${escapeHtml(bag.bag)}</h2>`,
    );
    parts.push(`<div class="table-wrap">`);
    parts.push(
      `<table><thead><tr><th>Name</th><th>Range</th><th>Latest</th><th>GitHub</th><th>Open issues</th><th>Socket</th></tr></thead><tbody>`,
    );
    for (const row of bag.rows) {
      const enriched =
        enrichmentByName.get(row.name) ??
        ({
          ...row,
          npmUrl: npmPackageUrl(row.name),
        } satisfies EnrichedDependencyRow);
      parts.push(dependencyRowHtml(enriched));
    }
    parts.push(`</tbody></table></div></section>`);
  }

  if (model.overrides.length > 0) {
    parts.push(
      `<section class="section"><h2>Overrides</h2>`,
    );
    parts.push(`<div class="table-wrap">`);
    parts.push(
      `<table><thead><tr><th>Key</th><th>Target</th></tr></thead><tbody>`,
    );
    for (const entry of model.overrides) {
      parts.push(
        `<tr><td>${escapeHtml(entry.key)}</td><td>${escapeHtml(entry.target)}</td></tr>`,
      );
    }
    parts.push(`</tbody></table></div></section>`);
  }

  if (model.generic.length > 0) {
    parts.push(`<section class="section"><h2>Other</h2><dl>`);
    for (const field of model.generic) {
      parts.push(
        `<dt>${escapeHtml(field.key)}</dt><dd>${renderValue(field.value)}</dd>`,
      );
    }
    parts.push(`</dl></section>`);
  }

  parts.push(`</main>`);
  return parts.join("\n");
}

function dependencyRowHtml(row: EnrichedDependencyRow): string {
  const nameCell = `<a href="${escapeAttr(row.npmUrl)}" title="Open on npm">${escapeHtml(row.name)}</a>`;
  const latestCell = row.latestDegrade
    ? degradeCell(row.latestDegrade, row.latest)
    : row.latest
      ? escapeHtml(row.latest)
      : `<span class="muted">—</span>`;
  const githubCell = row.githubDegrade && !row.githubUrl
    ? degradeCell(row.githubDegrade)
    : row.githubUrl
      ? `<a href="${escapeAttr(row.githubUrl)}">repo</a>${row.githubDegrade ? ` <span class="muted">(${escapeHtml(degradeLabel(row.githubDegrade))})</span>` : ""}`
      : `<span class="muted">—</span>`;
  const issuesTitle =
    "Open issues and pull requests on GitHub (issues + PRs)";
  const issuesCell =
    row.openIssuesCount !== undefined && row.issuesUrl
      ? `<a href="${escapeAttr(row.issuesUrl)}" title="${escapeAttr(issuesTitle)}" aria-label="${escapeAttr(`${row.openIssuesCount} open issues and pull requests`)}">${row.openIssuesCount}</a>`
      : `<span class="muted" title="${escapeAttr(issuesTitle)}">—</span>`;
  const socketCell = socketCellHtml(row);

  return `<tr><td>${nameCell}</td><td>${escapeHtml(row.range)}</td><td>${latestCell}</td><td>${githubCell}</td><td>${issuesCell}</td><td>${socketCell}</td></tr>`;
}

function degradeLabel(kind: "rate_limited" | "offline" | "timeout"): string {
  switch (kind) {
    case "rate_limited":
      return "rate limited";
    case "offline":
      return "offline";
    case "timeout":
      return "timeout";
  }
}

function degradeCell(
  kind: "rate_limited" | "offline" | "timeout",
  fallback?: string,
): string {
  const label = degradeLabel(kind);
  if (fallback) {
    return `${escapeHtml(fallback)} <span class="muted">(${escapeHtml(label)})</span>`;
  }
  return `<span class="muted error-cell">${escapeHtml(label)}</span>`;
}

function socketCellHtml(row: EnrichedDependencyRow): string {
  const socket = row.socket;
  if (!socket || socket.kind === "empty") {
    return `<span class="muted">—</span>`;
  }
  if (socket.kind === "cta") {
    const href = `command:packman.openSocketSettings`;
    return `<a class="muted" href="${href}">Set Socket token</a>`;
  }
  const cue = socket.highSeverity
    ? ` <span class="socket-high" title="Has high or critical Socket alerts">!</span>`
    : "";
  return `<a href="${escapeAttr(socket.url)}" title="Socket score (end-user token)">${socket.overall100}${cue}</a>`;
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return escapeHtml(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return escapeHtml(String(value));
  }
  if (value === null) {
    return escapeHtml("null");
  }
  return `<pre class="code-block"><code>${escapeHtml(JSON.stringify(value, null, 2))}</code></pre>`;
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
