import { parsePackageDocument } from "./parsePackageDocument";
import type { EnrichedDependencyRow } from "./enrichDependencyRow";
import {
  type PackageViewModel,
  toPackageViewModel,
} from "./packageViewModel";
import { npmPackageUrl } from "./fetchNpmLatest";

export type EnrichmentByName = ReadonlyMap<string, EnrichedDependencyRow>;

export type UiModeExtras = {
  /** Local clock label for when GitHub issue counts resume, e.g. "18:42". */
  githubResetLabel?: string;
};

export function renderUiModeHtml(
  documentText: string,
  nonce: string,
  enrichmentByName: EnrichmentByName = new Map(),
  extras?: UiModeExtras,
): string {
  const parsed = parsePackageDocument(documentText);
  if (!parsed.ok) {
    return shell(nonce, errorBody(parsed.error));
  }
  return shell(
    nonce,
    packageBody(toPackageViewModel(parsed.value), enrichmentByName, extras),
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
    }
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
      grid-template-columns: max-content minmax(0, 1fr);
      gap: 0.55rem var(--col-gap);
      margin: 0;
      align-items: baseline;
    }
    dt {
      color: var(--vscode-descriptionForeground);
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0;
      justify-self: stretch;
      min-width: 0;
      max-width: 100%;
      text-align: left;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      word-break: break-word;
    }
    dd:has(.scalar:not(.long)) {
      justify-self: end;
      text-align: right;
    }
    pre.code-block {
      margin: 0;
      padding: 0.55rem 0.7rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      color: var(--vscode-editor-foreground);
      overflow-x: auto;
      max-width: 100%;
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
      tab-size: 2;
      user-select: text;
      font-family: var(--vscode-editor-font-family, ui-monospace, monospace);
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
    .tok-key { color: var(--vscode-symbolIcon-keyForeground); }
    .tok-string { color: var(--vscode-debugTokenExpression-string, var(--vscode-symbolIcon-stringForeground)); }
    .tok-number { color: var(--vscode-debugTokenExpression-number, var(--vscode-symbolIcon-numberForeground)); }
    .tok-boolean { color: var(--vscode-debugTokenExpression-boolean, var(--vscode-symbolIcon-booleanForeground)); }
    .tok-null { color: var(--vscode-symbolIcon-nullForeground, var(--vscode-debugTokenExpression-boolean)); }
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
      gap: var(--col-gap);
      width: 100%;
      text-align: left;
      border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      box-sizing: border-box;
      padding: 0.5rem 0;
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
      flex: 0 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
      text-align: left;
    }
    button.script-button .cmd {
      margin-left: auto;
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
      padding: 0.45rem 0 0.45rem var(--col-gap);
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      vertical-align: baseline;
    }
    th:first-child,
    td:first-child {
      width: 100%;
      padding-left: 0;
      text-align: left;
      overflow-wrap: anywhere;
    }
    th:not(:first-child),
    td:not(:first-child) {
      width: 1%;
      white-space: nowrap;
      text-align: right;
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
    .notice {
      margin: 0 0 1.25rem;
      padding: 0.55rem 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-widget-border));
      background: var(--vscode-inputValidation-warningBackground, transparent);
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
  extras?: UiModeExtras,
): string {
  const parts: string[] = [`<main>`, `<h1>Packman</h1>`];
  if (githubRateLimitNotice(enrichmentByName)) {
    parts.push(githubNoticeHtml(extras?.githubResetLabel));
  }

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
    row.issuesDegrade === "rate_limited"
      ? "Paused — GitHub rate limit. The repo link still works."
      : "Open issues and pull requests on GitHub (issues + PRs)";
  const issuesCell =
    row.openIssuesCount !== undefined && row.issuesUrl
      ? `<a href="${escapeAttr(row.issuesUrl)}" title="${escapeAttr(issuesTitle)}" aria-label="${escapeAttr(`${row.openIssuesCount} open issues and pull requests`)}">${row.openIssuesCount}</a>`
      : `<span class="muted" title="${escapeAttr(issuesTitle)}">—</span>`;
  const socketCell = socketCellHtml(row);

  return `<tr><td>${nameCell}</td><td>${escapeHtml(row.range)}</td><td>${latestCell}</td><td>${githubCell}</td><td>${issuesCell}</td><td>${socketCell}</td></tr>`;
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
  return `<p class="notice">GitHub rate limit reached — issue counts paused${when}. Repo links still work. Allow the GitHub account prompt, or <a href="command:packman.openGithubSettings">set a token</a> (5,000/hour instead of 60).</p>`;
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
    const long = value.length > 40 ? " long" : "";
    return `<span class="scalar${long}">${escapeHtml(value)}</span>`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `<span class="scalar">${escapeHtml(String(value))}</span>`;
  }
  if (value === null) {
    return `<span class="scalar">null</span>`;
  }
  const json = JSON.stringify(value, null, 2);
  return `<pre class="code-block" aria-readonly="true"><code>${highlightJson(json)}</code></pre>`;
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
