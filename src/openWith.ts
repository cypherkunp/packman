export const PACKMAN_VIEW_TYPE = "packman.packageJson";

/**
 * Chooses the `vscode.openWith` viewId for toggling between Packman UI mode
 * and the native text Edit mode.
 */
export function resolveOpenWithViewId(
  activeCustomEditorId: string | undefined,
): typeof PACKMAN_VIEW_TYPE | "default" {
  if (activeCustomEditorId === PACKMAN_VIEW_TYPE) {
    return "default";
  }
  return PACKMAN_VIEW_TYPE;
}
