---
status: accepted
---

# Overlay the text editor instead of a default custom editor

Packman used to open every `package.json` in a webview custom editor (UI mode), and users had to switch to a separate text editor (Edit mode) to make changes. We now keep the native text editor as the default and attach Packman's information to it as an **Overlay**: CodeLenses run scripts and summarise each dependency block, end-of-line decorations give compact dependency signals, and hovers hold full enrichment. UI mode is kept, but only as an opt-in (`priority: "option"`). We traded the webview's free-form layout for zero mode-switching: VS Code can't render arbitrary HTML over a text editor, so every signal has to fit into CodeLens, decoration or hover surfaces.

## Consequences

- GitHub data is fetched only when a hover asks for it. The Overlay fires on every `package.json` opened, and loading GitHub data eagerly would exhaust the unauthenticated 60/hr limit.
- The Overlay never writes to the JSON. Write actions such as "bump to latest" are deferred to a separate decision.
- UI mode may be removed later if the Overlay covers its use; keeping it at `option` priority makes that removal cheap.
