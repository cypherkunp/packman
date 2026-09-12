# npm registry latest version and repository metadata

Ticket: [#7](https://github.com/cypherkunp/packman/issues/7) · Map: [#1](https://github.com/cypherkunp/packman/issues/1)  
Researched: 2026-09-12 · Sources: npm/registry package-metadata + REGISTRY-API, npm CLI dist-tag / package.json docs, live registry probes (primary only)

## Verdict

**Latest version** = `dist-tags.latest` on the public packument (`GET https://registry.npmjs.org/{package}`), not “highest semver in `versions`”. For Packman’s Dependency-row **latest** column plus a `repository` handoff to GitHub resolution (#6), prefer **`GET /{package}/latest`** (full version manifest): one small document with `version` + `repository` without downloading the full versions map. Abbreviated packuments (`Accept: application/vnd.npm.install-v1+json`) are enough for latest alone but **omit** `repository`. Missing, unpublished, and private-without-auth packages all look the same: **HTTP 404** `{"error":"Not found"}`.

## Endpoints

Base: `https://registry.npmjs.org` ([REGISTRY-API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)).

| Endpoint | Returns | Packman use |
|---|---|---|
| `GET /{package}` | Packument (“doc.json”): `dist-tags`, `versions`, plus full metadata when not abbreviated | Batch-friendly if you need tags + all versions; heavy for popular packages |
| `GET /{package}/{version}` | Single version manifest (`version` may be a semver **or** the literal `latest`) | **Preferred** for latest column + `repository` in one call |
| `GET /-/v1/search` | Search hits with `package.version` / `links.repository` | Not for authoritative per-row latest; search ranking / links only |

### URL encoding (scoped names)

Scoped names contain `/`. Encode the path segment so the slash is not a path separator, e.g. `@types/node` → `/@types%2Fnode` (or `%40types%2Fnode`). Verified 2026-09-12: `GET https://registry.npmjs.org/@types%2Fnode` → 200 with `name: "@types/node"`.

### Accept header (abbreviated vs full packument)

From [package-metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md):

- No `Accept` (or plain JSON) → **full** packument.
- `Accept: application/vnd.npm.install-v1+json` → **abbreviated** install metadata only.

Abbreviated top-level fields: `name`, `modified`, `dist-tags`, `versions` (install-needed fields per version). **No** top-level `repository`, `time`, `readme`, etc.

Full packument adds (among others) `time`, `users`, and fields **hoisted from the latest published version**, including `repository`, `description`, `homepage`, `bugs`, `license`, `maintainers`, `readme` (first 64K). Docs state: *“Every package will have a `latest` tag defined.”*

Size note (live, 2026-09-12): `lodash` abbreviated ~70KB vs full ~248KB; unabbreviated `npm` packument response ~25MB. Prefer abbreviated or `/{package}/latest` over full packuments for UI enrichment.

## Dist-tags and “latest”

`dist-tags` is a map of tag name → version string on the packument ([package-metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md), [REGISTRY-API Package object](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)).

From [npm-dist-tag](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag) / [Adding dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages):

- Default install target: `npm install <name>` resolves the **`latest`** tag.
- `npm publish` sets `latest` to the new version unless `--tag <other>` is used.
- Other tags (`next`, `beta`, `canary`, …) are aliases only; **no special meaning to npm** beyond `latest`.
- Tags share the specifier slot with versions (`@tag` vs `@semver`); tags that parse as semver ranges are rejected.

**Implication for Packman:** display `dist-tags.latest` (or `GET …/latest` → `version`) as “latest on npm”, not `max(semver(Object.keys(versions)))`. Maintainers often keep prereleases on other tags while `latest` stays on the stable line (e.g. `react` also has `next` / `canary` / `experimental` — probed 2026-09-12).

`versions` on the packument is the full published version set (keys = semver strings). Useful if Packman later needs “is installed version deprecated?” (`versions[v].deprecated`) or publish times (`time[v]` on full metadata only). Not required for the latest column.

## Repository field (feeds #6)

### Shape

From [package.json § repository](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#repository) and [package-metadata § repository](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md):

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/npm/cli.git",
  "directory": "workspaces/libnpmpublish"
}
```

Also allowed as shortcut strings (`"npm/npm"`, `"github:user/repo"`, gist/bitbucket/gitlab forms). Optional `directory` for monorepos. URL is meant for VCS clients, not an HTML project page.

### Where it appears in registry responses

| Document | `repository` present? |
|---|---|
| Abbreviated packument | **No** (top-level or per-version) — verified `lodash` 2026-09-12 |
| Full packument | Yes, **hoisted** from latest at top level; also on each `versions[v]` that declared it |
| `GET /{package}/latest` (or `/{package}/{semver}`) | Yes, from that version’s `package.json` — verified `lodash` / `@types/node` |

**Packman recommendation:** for Dependency rows that need both latest + GitHub input, call `GET /{package}/latest` and read `version` + `repository`. If only latest is needed, abbreviated `GET /{package}` → `dist-tags.latest` is smaller. Do not rely on search `links.repository` as the source of truth.

Normalizing `repository.url` / shortcuts into an `owner/repo` for the GitHub API is **out of scope here** (ticket #6).

## Recommended Packman calls

### A. Latest + repository (preferred for v1 columns)

```http
GET https://registry.npmjs.org/{package}/latest
Accept: application/json
```

Fields: `version`, `repository` (plus `name`, `description`, `homepage`, `bugs`, …).

### B. Latest only (cheapest packument)

```http
GET https://registry.npmjs.org/{package}
Accept: application/vnd.npm.install-v1+json
```

Field: `dist-tags.latest`.

### C. Full packument (avoid unless needed)

```http
GET https://registry.npmjs.org/{package}
```

Use when you need `time`, starred `users`, readme, or all version manifests with non-install fields. Cache hard; response size can be multi‑MB.

No auth required for **public** packages. CORS is irrelevant for a VS Code/Cursor extension host fetch.

## Failure modes

Probed against `registry.npmjs.org` on 2026-09-12 unless noted.

| Situation | HTTP | Body (observed / documented) | Packman UX |
|---|---|---|---|
| Unknown name / never published | **404** | `{"error":"Not found"}` | Show “—” / “not on npm”; do not invent a version |
| Unpublished (removed from public registry) | **404** | Same opaque not-found (registry does not expose a distinct public tombstone in this API) | Same as missing |
| Private package, no token | **404** | Same `{"error":"Not found"}` | Indistinguishable from missing without auth |
| Private package, with npm token | 200 (when authorized) | Normal packument/manifest | Out of v1 map fog (“Private registries and authenticated npm fetches” still unspecified on #1) |
| Known package, unknown version | **404** | `"version not found: {version}"` (JSON string) | Only relevant if calling `/{package}/{semver}` with a bad version |
| Network / registry outage | 5xx / transport error | — | Degrade column; retry/backoff (caching unspecified on map) |

Private packages ([About private packages](https://docs.npmjs.com/about-private-packages)): always scoped; paid account; invisible to unauthorized clients. Auth is via registry-scoped tokens in npmrc ([npmrc](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc)), e.g. `//registry.npmjs.org/:_authToken=…`. Unauthenticated public registry GETs will not reveal private metadata.

**Do not** treat 404 as “definitely never existed” if the workspace might use a private scope — without reading the user’s npm auth, Packman cannot tell private from missing.

## Sources

1. [npm/registry — package metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md) — endpoints, Accept abbreviated vs full, `dist-tags`, hoisted `repository`, size guidance  
2. [npm/registry — REGISTRY-API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md) — `GET /{package}`, `GET /{package}/{version}`, Package/Version objects, search  
3. [npm-dist-tag](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag) — `latest` as default install tag; publish/`--tag` behavior  
4. [Adding dist-tags to packages](https://docs.npmjs.com/adding-dist-tags-to-packages) — publish defaults to `latest`  
5. [package.json — repository](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#repository) — object / shortcut / `directory` forms  
6. [About private packages](https://docs.npmjs.com/about-private-packages) — scoped-only private; auth required to see them  
7. [npmrc](https://docs.npmjs.com/cli/v11/configuring-npm/npmrc) — host-scoped `_authToken`  
8. Live probes (2026-09-12): `lodash` / `@types/node` / missing name / missing version / abbreviated vs full field sets
