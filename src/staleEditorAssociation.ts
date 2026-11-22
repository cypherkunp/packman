/**
 * UI mode was a custom editor with view type `packman.packageJson`. Users who
 * pinned it through `workbench.editorAssociations` would now get a missing
 * editor, so Packman offers once to remove that entry. It never edits the
 * user's settings without the click.
 */

export const RETIRED_VIEW_TYPE = "packman.packageJson";
export const REMOVE_ASSOCIATION = "Remove association";

/**
 * Where `workbench.editorAssociations` can be set: user settings, the
 * workspace, and each workspace folder. `Scope` is the host's own handle.
 */
export type StaleAssociationHost<Scope> = {
  scopes(): readonly Scope[];
  readAssociations(scope: Scope): Record<string, string> | undefined;
  writeAssociations(
    scope: Scope,
    value: Record<string, string> | undefined,
  ): Promise<void>;
  showPrompt(message: string, action: string): Promise<string | undefined>;
  wasDismissed(): boolean;
  markDismissed(): Promise<void>;
};

export async function promptStaleEditorAssociation<Scope>(
  host: StaleAssociationHost<Scope>,
): Promise<void> {
  if (host.wasDismissed()) {
    return;
  }
  const stale = host.scopes().filter((scope) =>
    hasRetiredEntry(host.readAssociations(scope)),
  );
  if (stale.length === 0) {
    return;
  }

  // Shown once: an unanswered prompt never comes back either.
  await host.markDismissed();
  const answer = await host.showPrompt(
    "Your editor associations still open package.json in a Packman editor that no longer exists. Remove that association so package.json opens in the text editor?",
    REMOVE_ASSOCIATION,
  );
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
  return Object.entries(associations ?? {}).some(isRetiredEntry);
}

function withoutRetiredEntries(
  associations: Record<string, string>,
): Record<string, string> | undefined {
  const kept = Object.entries(associations).filter(
    (entry) => !isRetiredEntry(entry),
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/**
 * Packman's own entry: a pattern for `package.json` (`package.json`, or a
 * glob ending in `/package.json`) opened with the retired editor. Other
 * entries that name it were written by hand and are left alone.
 */
function isRetiredEntry([pattern, viewType]: [string, string]): boolean {
  return viewType === RETIRED_VIEW_TYPE && /(^|\/)package\.json$/.test(pattern);
}
