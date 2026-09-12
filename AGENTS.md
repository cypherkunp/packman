## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

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
