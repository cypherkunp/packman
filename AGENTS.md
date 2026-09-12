## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Issue → PR workflow

**Mandatory.** After work on an issue is done:

1. Open a pull request for review (do not leave the work only on a local/remote branch).
2. Link the issue in the PR body with `Closes #<n>` (or `Fixes #<n>`).
3. **Do not** close the issue when implementation finishes — leave it open while the PR is in review.
4. The issue is closed when the PR is closed (merged or otherwise closed). Prefer GitHub auto-close via the PR keyword; if the PR is closed without merging and the work is abandoned, close the issue explicitly with a comment.

See `docs/agents/issue-tracker.md`.

## Commits

**Mandatory.** Every commit message (including Cursor's Generate Commit Message / sparkle button, Agent commits, and manual commits) MUST follow [Conventional Commits](https://www.conventionalcommits.org/). Do not imitate non-conventional history such as `Initial commit`.

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **Description**: imperative mood, lowercase start, no trailing period
- **Scope** (optional): e.g. `feat(cli): …`, `docs(agents): …`
- **Breaking**: `feat!: …` and/or a `BREAKING CHANGE:` footer
- Subject ≤72 characters; body only when needed
- No gitmoji, no quoted subjects, no markdown fences around the message

Good:
- `docs(agents): add conventional commits guidance`
- `chore: scaffold agent skills config`
- `feat!: drop legacy pack format`

Bad:
- `Update AGENTS.md`
- `Initial commit`
- `Fixed stuff`
