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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Packman</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 1.25rem 1.5rem 2rem;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
    }
    h1 {
      font-size: 1.15rem;
      font-weight: 600;
      margin: 0 0 1rem;
    }
    h2 {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin: 1.5rem 0 0.6rem;
    }
    .section:first-of-type h2 { margin-top: 0.25rem; }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.35rem 1rem;
      margin: 0;
    }
    dt {
      color: var(--vscode-descriptionForeground);
    }
    dd {
      margin: 0;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      white-space: pre-wrap;
      word-break: break-word;
    }
    .scripts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    button.script-button {
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 0.35rem 0.7rem;
      border-radius: 2px;
      cursor: default;
      font: inherit;
    }
    button.script-button .cmd {
      opacity: 0.7;
      margin-left: 0.4rem;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    }
    th, td {
      text-align: left;
      padding: 0.35rem 0.5rem;
      border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    }
    th {
      color: var(--vscode-descriptionForeground);
      font-weight: 500;
    }
    td.muted {
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
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
        `<dt>${escapeHtml(field.key)}</dt><dd>${escapeHtml(formatValue(field.value))}</dd>`,
      );
    }
    parts.push(`</dl></section>`);
  }

  if (model.scripts.length > 0) {
    parts.push(`<section class="section"><h2>Scripts</h2><div class="scripts">`);
    for (const script of model.scripts) {
      parts.push(
        `<button type="button" class="script-button" data-script="${escapeAttr(script.name)}" disabled title="${escapeAttr(script.command)}"><span>${escapeHtml(script.name)}</span><span class="cmd">${escapeHtml(script.command)}</span></button>`,
      );
    }
    parts.push(`</div></section>`);
  }

  for (const bag of model.dependencyBags) {
    parts.push(
      `<section class="section"><h2>${escapeHtml(bag.bag)}</h2>`,
    );
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
    parts.push(`</tbody></table></section>`);
  }

  if (model.overrides.length > 0) {
    parts.push(
      `<section class="section"><h2>Overrides</h2>`,
    );
    parts.push(
      `<table><thead><tr><th>Key</th><th>Target</th></tr></thead><tbody>`,
    );
    for (const entry of model.overrides) {
      parts.push(
        `<tr><td>${escapeHtml(entry.key)}</td><td>${escapeHtml(entry.target)}</td></tr>`,
      );
    }
    parts.push(`</tbody></table></section>`);
  }

  if (model.generic.length > 0) {
    parts.push(`<section class="section"><h2>Other</h2><dl>`);
    for (const field of model.generic) {
      parts.push(
        `<dt>${escapeHtml(field.key)}</dt><dd>${escapeHtml(formatValue(field.value))}</dd>`,
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

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
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
