import { parsePackageDocument } from "./parsePackageDocument";
import {
  type PackageViewModel,
  toPackageViewModel,
} from "./packageViewModel";

export function renderUiModeHtml(documentText: string, nonce: string): string {
  const parsed = parsePackageDocument(documentText);
  if (!parsed.ok) {
    return shell(nonce, errorBody(parsed.error));
  }
  return shell(nonce, packageBody(toPackageViewModel(parsed.value)));
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

function packageBody(model: PackageViewModel): string {
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
    parts.push(`<table><thead><tr><th>Name</th><th>Range</th></tr></thead><tbody>`);
    for (const row of bag.rows) {
      parts.push(
        `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.range)}</td></tr>`,
      );
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
