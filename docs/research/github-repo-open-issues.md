# Resolving GitHub repo URL and open issues for an npm package

Ticket: [#6](https://github.com/cypherkunp/packman/issues/6) · Map: [#1](https://github.com/cypherkunp/packman/issues/1)  
Researched: 2026-09-12 · Sources: npm/registry package-metadata + REGISTRY-API, npm CLI `package.json` docs, GitHub REST (repos, rate limits, search, auth); live probes (primary only)

## Verdict

**Reliable path:** (1) read `repository` from the npm registry version manifest (`GET https://registry.npmjs.org/{package}/{version|latest}`), (2) normalize that field to a GitHub `owner/repo` when the host is GitHub, (3) call `GET https://api.github.com/repos/{owner}/{repo}` for `html_url` + `open_issues_count`. Prefer registry metadata over npm search links, HTML scraping, or GitHub Search-by-name. Optional user PAT raises the GitHub primary limit from **60/hour (IP)** to **5,000/hour (user)**; without a PAT, show the repo link from npm when parseable and degrade the issues column on `403`/`429`/exhausted budget.

## Resolution path (Packman)

```text
package name (+ optional version)
        │
        ▼
GET registry.npmjs.org/{name}/{version|latest}     ← repository (authoritative for that publish)
        │
        ▼
Normalize repository → github owner/repo
  (object.url | string shortcut; strip git+/ssh/.git; reject non-GitHub hosts)
  optional fallbacks: bugs.url, homepage — only if clearly github.com/... 
        │
        ▼
GET api.github.com/repos/{owner}/{repo}
  Authorization: Bearer <optional PAT>
        │
        ├─ html_url          → Dependency “GitHub repo” link
        └─ open_issues_count → open-issues signal (issues + PRs; see below)
```

Reuse the same registry call as the “latest version” column when version is omitted (`/{package}/latest`); see ticket [#7](https://github.com/cypherkunp/packman/issues/7) (npm registry latest / repository metadata).

## Step 1 — npm `repository` metadata

### Endpoint

| Call | Why |
|---|---|
| `GET https://registry.npmjs.org/{package}/{version}` | Version-pinned Dependency row |
| `GET https://registry.npmjs.org/{package}/latest` | Default when no version / “latest” column handoff |

Documented in [REGISTRY-API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) (`GET /{package}/{version}` — version may be a semver **or** the literal `latest`) and [package-metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md).

Scoped names: encode the slash (`@types/node` → `/@types%2Fnode/latest`).

**Do not** use abbreviated packuments (`Accept: application/vnd.npm.install-v1+json`) for this path — they omit `repository` ([package-metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)). Full packument top-level `repository` is only hoisted from **latest**, so for a non-latest installed version use `/{package}/{version}`, not the packument root.

### Field shape

From [package.json § repository](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#repository) and [package-metadata § repository](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md):

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/npm/cli.git",
  "directory": "workspaces/libnpmpublish"
}
```

Also allowed as shortcuts (`"npm/npm"`, `"github:user/repo"`, gist/bitbucket/gitlab). npm normalizes shortcuts to `{ type, url }` on publish. Optional `directory` is monorepo path metadata — keep for deep-links if useful; GitHub Issues still live on the **repo**, not the subdirectory.

URL is meant for VCS clients (often `git+https://…`, `git://…`, `git+ssh://git@github.com:…`), not an HTML project page.

### Live shapes (2026-09-12)

| Package | `repository.url` form |
|---|---|
| `lodash@4.17.21` | `git+https://github.com/lodash/lodash.git` |
| `express` (latest) | `git+https://github.com/expressjs/express.git` |
| `left-pad` (latest) | `git+ssh://git@github.com/stevemao/left-pad.git` |
| `react` (latest) | `git+https://github.com/react/react.git` + `directory: packages/react` |

`bugs.url` often mirrors `https://github.com/{owner}/{repo}/issues` (lodash, express) — useful **fallback** to extract `owner/repo` when `repository` is missing/malformed, not a substitute for open-issue counts (static URL only).

### Normalizing to GitHub `owner/repo`

Parse only when the host is GitHub (`github.com` / `www.github.com`, or shortcut `github:owner/repo` / bare `owner/repo` after npm-style hosting rules). Suggested extract rules (implementation detail; derived from observed registry forms + package.json docs):

1. If string shortcut: expand `github:o/r` / `o/r` → `o/r`; reject `bitbucket:` / `gitlab:` / `gist:`.
2. If object: take `url` (ignore `type` unless you want to skip non-`git`).
3. Strip wrappers: leading `git+`, trailing `.git`, credentials, and path noise.
4. Accept `https://github.com/o/r`, `git://github.com/o/r`, `ssh://git@github.com/o/r`, `git@github.com:o/r`.
5. If host ≠ GitHub → **no GitHub columns** (link elsewhere later if desired; v1 asks for GitHub).

Missing package / private-without-auth → registry **404** `{"error":"Not found"}` (same opacity as #7). Missing `repository` → no GitHub resolution unless `bugs`/`homepage` clearly encode `github.com/owner/repo`.

## Step 2 — GitHub repo + open-issues signal

### Preferred API

```http
GET /repos/{owner}/{repo}
Accept: application/vnd.github+json
Authorization: Bearer <PAT>   # optional
X-GitHub-Api-Version: 2022-11-28
```

[Get a repository](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#get-a-repository). Public repos work unauthenticated.

| Field | Packman use |
|---|---|
| `html_url` | Canonical browser URL for the repo link |
| `full_name` | `owner/repo` after redirects/renames |
| `open_issues_count` | Open-issues **signal** (integer) |
| `open_issues` | Alias of the same count in the schema |

Follow **301** redirects (`Location` may be `/repositories/{id}`); clients should use `-L` / fetch redirect-following so renamed repos still resolve. Probed: `GET /repos/facebook/react` → **301** → repository id; `react/react` returns 200 with `open_issues_count`.

### What `open_issues_count` means

GitHub’s Issues REST model treats every pull request as an issue ([Issues REST](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28)). Empirically (2026-09-12, `lodash/lodash`):

| Signal | Value |
|---|---|
| `open_issues_count` | **105** |
| Search `repo:lodash/lodash is:issue is:open` `total_count` | **54** |
| Search `repo:lodash/lodash is:pr is:open` `total_count` | **51** |

So **`open_issues_count` = open issues + open PRs**. Fine as a comparable “open activity” signal for a Dependency row; if Packman ever needs issue-only counts, that requires Search (or paging Issues and filtering `pull_request`) — not worth it for v1 given rate limits below.

## Comparisons (other approaches)

| Approach | Repo URL | Open issues | Verdict for Packman |
|---|---|---|---|
| **npm `repository` + `GET /repos/...`** | Authoritative for the published version | `open_issues_count` in one call | **Recommended** |
| npm full packument top-level `repository` | Latest only (hoisted) | Still needs GitHub | OK if version always latest; wrong for pinned older versions |
| npm `GET /-/v1/search` `links.repository` | Convenience HTTPS link in search hits ([REGISTRY-API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)) | None | Ranking/search only; not authoritative per-row metadata |
| `bugs` / `homepage` alone | Sometimes GitHub URLs | None | Fallback parse only |
| **GitHub Search** (`GET /search/repositories` or `/search/issues`) | Guess by name → collisions | Issue-only via `is:issue` | Harsh separate quota; name≠package; avoid as primary resolver |
| HTML scrape (npmjs.com / github.com) | Fragile selectors | Fragile / ToS risk | Reject — unsupported vs documented APIs |

## Rate limits and optional PAT

### Primary (core) REST — includes `GET /repos/{owner}/{repo}`

From [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28):

| Auth | Primary limit |
|---|---|
| Unauthenticated (public data, keyed by **IP**) | **60 requests / hour** |
| Authenticated user / PAT | **5,000 requests / hour** |
| GitHub App installation | ≥5,000 / hour (scales; Enterprise Cloud higher) |

Auth header ([Authenticating to the REST API](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api?apiVersion=2022-11-28)):

```http
Authorization: Bearer YOUR-TOKEN
```

(`Authorization: token …` also accepted for PATs; prefer `Bearer`.)

For **public** repo metadata, a classic PAT with **no special scopes** is enough; fine-grained tokens need whatever permission the endpoint documents for private visibility. Packman’s optional settings PAT is an upgrade for quota (and private repos later), not a hard requirement — matches map Out of scope: “Required auth before GitHub/Socket columns work.”

Response headers to honor: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-resource` (expect `core` for repo GET). On primary exhaustion: `403` or `429` with `x-ratelimit-remaining: 0` — wait until `x-ratelimit-reset`. Secondary limits also exist (concurrency / burst); back off on `retry-after` when present.

`GET /rate_limit` does not consume the primary budget ([rate-limit endpoints](https://docs.github.com/en/rest/rate-limit/rate-limit?apiVersion=2022-11-28)).

Live unauthenticated probe (2026-09-12): `GET /repos/lodash/lodash` returned `x-ratelimit-limit: 60`, `x-ratelimit-resource: core`.

### Search API (if used for issue-only counts)

Separate bucket ([Search](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28)):

| Auth | Search limit (non-code) |
|---|---|
| Unauthenticated | **10 requests / minute** |
| Authenticated | **30 requests / minute** |

Code search is tighter and requires auth. Live `GET /rate_limit` showed `search.limit: 10` unauthenticated. **Do not** use Search as the default open-issues path for every Dependency row.

### Graceful degradation (v1)

1. No / non-GitHub `repository` → blank GitHub columns (optional: show non-GH repo URL later).
2. Registry 404 → treat like unknown package (#7).
3. GitHub 404 → metadata lied or repo deleted/private; blank count, don’t invent.
4. Rate limited / no remaining budget → keep **repo link** from normalized npm URL (`https://github.com/{owner}/{repo}`) even without a successful API call; show “—” / stale cache for issues; if PAT configured, retry with `Authorization`.
5. Never block UI mode on enrichment failures.

Rough budget math: one `GET /repos` per distinct GitHub repo per refresh. Unauthenticated 60/hour is easy to blow on a large `package.json` without caching/deduping. PAT (5k/hour) is the intended “enrich many rows” path.

## Recommended Packman behavior (summary)

1. `GET registry.npmjs.org/{name}/{version|latest}` → `repository` (+ optional `bugs` fallback).
2. Normalize to GitHub `owner/repo` or stop.
3. `GET api.github.com/repos/{owner}/{repo}` with optional `Authorization: Bearer` settings PAT.
4. Display `html_url` + `open_issues_count` (document in UI copy that the number includes PRs, or label “open issues+PRs”).
5. Cache by `owner/repo` (and npm name@version for repository string); respect rate-limit headers; degrade without PAT.

## Sources

1. [npm/registry — package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) — full vs abbreviated; hoisted `repository`; per-version fields  
2. [npm/registry — REGISTRY-API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) — `GET /{package}`, `GET /{package}/{version}`, search `links.repository`  
3. [package.json — repository](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#repository) — object / shortcut / `directory`; VCS URL intent  
4. [Get a repository](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#get-a-repository) — `html_url`, `open_issues_count`  
5. [REST API endpoints for issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28) — PRs are issues in the REST model  
6. [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28) — 60/hr unauth, 5,000/hr authenticated  
7. [REST API endpoints for rate limits](https://docs.github.com/en/rest/rate-limit/rate-limit?apiVersion=2022-11-28) — `core` vs `search` buckets  
8. [REST API endpoints for search](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28) — 10/min unauth, 30/min auth search limits  
9. [Authenticating to the REST API](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api?apiVersion=2022-11-28) — `Authorization: Bearer` PAT  
10. Live probes (2026-09-12): registry `repository`/`bugs` shapes; GitHub `open_issues_count` vs Search issue/PR totals; unauthenticated `x-ratelimit-*` headers  
