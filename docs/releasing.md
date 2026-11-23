# Releasing

Packman is published as **`startfrom.packman`** to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=startfrom.packman) and [Open VSX](https://open-vsx.org/extension/startfrom/packman). Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets), and publishing is automated by `.github/workflows/release.yml`.

## Day to day

1. In a PR that changes what users get, run `npx changeset`, pick the bump and write the changelog line. Commit the `.changeset/*.md` file with the PR.
2. Merge the PR to `main`. The Release workflow opens or updates a **`chore: version packages`** PR that bumps `package.json`, updates `CHANGELOG.md` and deletes the consumed changesets.
3. Merge the version PR when you want to ship. The Release workflow then:
   - packages `packman-<version>.vsix`;
   - publishes it to the VS Code Marketplace and Open VSX (`--skip-duplicate`, so re-runs are safe);
   - tags `v<version>` and creates a GitHub release with that version's changelog section and the VSIX attached.

A push to `main` publishes only when there are no pending changesets **and** `v<version>` isn't tagged yet. To retry a failed publish, re-run the workflow, or run it from the Actions tab (`workflow_dispatch`).

Before 1.0.0, use `minor` for breaking changes and `patch` for everything else.

## One-time setup

### VS Code Marketplace

1. Make sure the `startfrom` publisher exists at <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps Personal Access Token at <https://dev.azure.com> → User settings → Personal access tokens:
   - **Organization:** All accessible organizations
   - **Scopes:** Custom defined → **Marketplace → Manage**
3. Add it as the `VSCE_PAT` repository secret.

### Open VSX

1. Sign in at <https://open-vsx.org> with GitHub and sign the Eclipse Publisher Agreement (Profile page).
2. Create an access token under Settings → Access Tokens.
3. Create the namespace once: `npx ovsx create-namespace startfrom -p <token>`. To get the verified badge, claim the namespace through an issue at <https://github.com/EclipseFdn/open-vsx.org>.
4. Add the token as the `OVSX_PAT` repository secret.

### GitHub

- Settings → Actions → General → Workflow permissions: enable **Allow GitHub Actions to create and approve pull requests**, so the workflow can open the version PR.
- The version PR is opened with `GITHUB_TOKEN`, so CI doesn't run on it automatically. Close and reopen it to trigger CI, or switch the action's token to a GitHub App or fine-grained PAT.

## Manual release (fallback)

```sh
npx vsce package --out packman.vsix
npx vsce publish --packagePath packman.vsix -p "$VSCE_PAT"
npx ovsx publish --packagePath packman.vsix -p "$OVSX_PAT"
git tag "v$(node -p "require('./package.json').version")" && git push --tags
```
