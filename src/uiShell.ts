/**
 * Empty Packman UI mode shell styled with VS Code design tokens.
 * Package data arrives in a later ticket (#18).
 */
export function buildUiShellHtml(nonce = "packman"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Packman</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 1.5rem;
      background: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .placeholder {
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <main class="placeholder">
    <h1>Packman</h1>
    <p>UI mode shell — package.json contents arrive next.</p>
  </main>
</body>
</html>`;
}
