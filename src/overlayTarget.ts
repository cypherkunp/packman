/**
 * Whether a document path should get the Overlay: any `package.json`
 * (saved or not) that isn't inside `node_modules/`.
 */
export function isOverlayTarget(path: string): boolean {
  const segments = path.split(/[/\\]/);
  if (segments[segments.length - 1]?.toLowerCase() !== "package.json") {
    return false;
  }
  return !segments.includes("node_modules");
}

/** The documents that get the Overlay, e.g. from `workspace.textDocuments`. */
export function overlayTargetDocuments<T extends { uri: { path: string } }>(
  documents: readonly T[],
): T[] {
  return documents.filter((document) => isOverlayTarget(document.uri.path));
}
