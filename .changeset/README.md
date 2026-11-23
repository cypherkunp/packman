# Changesets

Every pull request that changes what users get (a feature, a fix, a behaviour change) adds a changeset:

```sh
npx changeset
```

Pick `patch`, `minor` or `major` and write one or two lines for the changelog. Write them for users of the extension, not for reviewers. Commit the generated `.changeset/*.md` file with the PR.

Changes with nothing to release (docs, CI, refactors) don't need one.

See [docs/releasing.md](../docs/releasing.md) for how releases reach the Marketplace.
