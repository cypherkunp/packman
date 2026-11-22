/**
 * UI mode was a custom editor with view type `packman.packageJson`. Users who
 * pinned it through `workbench.editorAssociations` would now get a missing
 * editor, so Packman offers once to remove that entry. It never edits the
 * user's settings without the click.
 */

export const RETIRED_VIEW_TYPE = "packman.packageJson";
export const REMOVE_ASSOCIATION = "Remove association";

export type AssociationScope = "global" | "workspace";

export type StaleAssociationHost = {
  readAssociations(scope: AssociationScope): Record<string, string> | undefined;
  writeAssociations(
    scope: AssociationScope,
    value: Record<string, string> | undefined,
  ): Promise<void>;
  showPrompt(message: string, action: string): Promise<string | undefined>;
  wasDismissed(): boolean;
  markDismissed(): Promise<void>;
};

const SCOPES: AssociationScope[] = ["global", "workspace"];

export async function promptStaleEditorAssociation(
  host: StaleAssociationHost,
): Promise<void> {
  if (host.wasDismissed()) {
    return;
  }
  const stale = SCOPES.filter((scope) =>
    hasRetiredEntry(host.readAssociations(scope)),
  );
  if (stale.length === 0) {
    return;
  }

  const answer = await host.showPrompt(
    "Packman no longer has a UI mode, but your editor associations still open package.json with it. Remove that association so package.json opens in the text editor?",
    REMOVE_ASSOCIATION,
  );
  await host.markDismissed();
  if (answer !== REMOVE_ASSOCIATION) {
    return;
  }
  for (const scope of stale) {
    await host.writeAssociations(
      scope,
      withoutRetiredEntries(host.readAssociations(scope) ?? {}),
    );
  }
}

function hasRetiredEntry(
  associations: Record<string, string> | undefined,
): boolean {
  return Object.values(associations ?? {}).includes(RETIRED_VIEW_TYPE);
}

function withoutRetiredEntries(
  associations: Record<string, string>,
): Record<string, string> | undefined {
  const kept = Object.entries(associations).filter(
    ([, viewType]) => viewType !== RETIRED_VIEW_TYPE,
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}
