# Socket.dev npm risk signals for Packman columns

Ticket: [#5](https://github.com/cypherkunp/packman/issues/5) · Map: [#1](https://github.com/cypherkunp/packman/issues/1)  
Researched: 2026-09-12 · Sources: Socket official docs / OpenAPI / Free ToS (primary only)

## Verdict

**Use org-scoped batch PURL fetch** — `POST https://api.socket.dev/v0/orgs/{org_slug}/purl` with `packages:list` — to hydrate a per-dependency column. Prefer `score.overall` (0–1) plus a compact alert severity rollup; deep-link to the Socket package page. Auth is **required** for the REST API (org token). Packman’s “optional API key” maps to: column empty / CTA when unset, full signals when set. Free ToS Acceptable Use §14 is the main redistribution constraint for shipping Socket data inside a product.

## Recommended API

### Current (preferred)

| | |
|---|---|
| Method / path | `POST /v0/orgs/{org_slug}/purl` |
| Base URL | `https://api.socket.dev/v0` |
| Scope | `packages:list` |
| Quota cost | **100 units** per request |
| Batch limit | Default **1024** PURLs / request (over → `400`) |
| npm PURL | `pkg:npm/{name}@{version}` · scoped: `pkg:npm/%40scope%2Fname@version` (URL-encode `@` in namespace as needed per PURL rules) |

Docs: [Get Packages by PURL (Org Scoped)](https://docs.socket.dev/reference/batchpackagefetchbyorg), [Socket PURLs](https://docs.socket.dev/reference/socket-package-urls-purl).

Example body:

```json
{
  "components": [
    { "purl": "pkg:npm/express@4.19.2" },
    { "purl": "pkg:npm/lodash@4.17.21" }
  ]
}
```

Useful query params (same set as legacy `POST /v0/purl`):

- `alerts=true` — include alert objects (also synthesizes `pendingScan` / `notFound` when useful)
- `compact=true` — drops author/scores/size/deps/manifests; **keep `compact=false` if you need `score`**
- `actions=error,warn` — filter by policy action
- `poll` / `timeoutSec` — wait for pending analysis (default fail-open)
- `labels={slug}` — apply one repo-label security policy (org-scoped only)

### Deprecated (do not build on)

| Endpoint | Notes |
|---|---|
| `GET /npm/{package}/{version}/score` | Deprecated; successor is batch PURL. Cost **1** quota; auth required, **no scopes**. Response uses `depscore` + category metric objects. |
| `GET /npm/{package}/{version}/issues` | Deprecated; same successor. Cost **1** quota. |
| `POST /v0/purl` | Deprecated since **2026-01-05**; replaced by org-scoped path above. Same 100-unit / 1024-PURL model. |

Sources: [getScoreByNPMPackage](https://docs.socket.dev/reference/getscorebynpmpackage), [getIssuesByNPMPackage](https://docs.socket.dev/reference/getissuesbynpmpackage), [batchPackageFetch](https://docs.socket.dev/reference/batchpackagefetch).

### SDKs

- [Socket Python SDK](https://docs.socket.dev/docs/socket-python-sdk): `socket.npm.score` / `socket.npm.issues` deprecated → `socket.purl.post(...)` / `POST /orgs/{org_slug}/purl`.
- [Socket JavaScript SDK](https://docs.socket.dev/docs/socket-javascript-sdk) (`@socketsecurity/sdk`): **deprecated**; call REST directly.

### Public score badge (undocumented integration)

Observed (browser): `GET https://socket.dev/api/badge/npm/package/{name}` and `…/{name}/{version}` return `image/svg+xml` shields with title like `Socket: 97` (0–100 display). Used on Socket package pages / README embeds (e.g. `![Socket score](https://socket.dev/api/badge/npm/package/store-badge/1.3.0)`).

**Not** in [docs.socket.dev](https://docs.socket.dev/llms.txt) as a supported API. Curl from datacenter IPs often hits Cloudflare challenge; fine for human browsers / img tags. Suitable only as a no-key **visual** fallback, not as a structured JSON source. Still subject to Free ToS (below).

## Auth

| Fact | Source |
|---|---|
| REST uses **organization tokens** from org settings | [Authentication](https://docs.socket.dev/reference/authentication), [API Tokens](https://docs.socket.dev/docs/api-keys) |
| Pass as `Authorization: Bearer <token>` **or** HTTP Basic with token as **username**, empty password (`-u "TOKEN:"`) | same |
| Tokens are **required** for Socket CLI and REST API | [API Tokens](https://docs.socket.dev/docs/api-keys) |
| Org-scoped PURL needs scope `packages:list` | [batchPackageFetchByOrg](https://docs.socket.dev/reference/batchpackagefetchbyorg) |
| Unauthenticated `GET /v0/npm/.../score` → `401 Unauthorized` (verified 2026-09-12) | live probe |

**Packman mapping:** settings field for Socket org token (+ org slug for the path). “Optional” = feature gated off without credentials; the API itself has **no** anonymous score/issues JSON.

Store tokens securely; rotate via dashboard ([API Tokens](https://docs.socket.dev/docs/api-keys)).

## Rate limits & quota

Two independent governors:

1. **Rate limit:** **600 requests / minute**. Over → `429`. Retry with exponential backoff + jitter; failed retries still count. Orgs can request increases via support.  
   Source: [Rate Limits](https://docs.socket.dev/reference/rate-limits).

2. **Hourly token quota:** each route costs N units; token has `maxQuota` per hour. Exhaustion → `429` with `Retry-After` (seconds).  
   Source: [Quota](https://docs.socket.dev/reference/quota).

Check remaining: `GET /v0/quota` (0 units) → `{ quota, maxQuota, nextWindowRefresh }`.  
Source: [Get quota](https://docs.socket.dev/reference/getquota).

**Packman math:** one UI refresh for ≤1024 deps ≈ **1 request / 100 quota units**. Prefer batching all dependency rows into a single POST rather than N score calls. Cache aggressively (map fog already lists caching as unspecified).

## Response fields for a table column

### Scores (`score` object on each artifact)

From OpenAPI `SocketScore` on the PURL endpoints:

| Field | Range | Meaning |
|---|---|---|
| `overall` | 0.0–1.0 | Combined health/safety — **best single column value** |
| `supplyChain` | 0.0–1.0 | Supply-chain / provenance |
| `vulnerability` | 0.0–1.0 | Known vulns / severity |
| `quality` | 0.0–1.0 | Code quality / docs / testing signals |
| `maintenance` | 0.0–1.0 | Maintainer / release activity |
| `license` | 0.0–1.0 | License permissiveness / compatibility |

Public UI / badges often show **0–100** (`100 × score`). Scoring model (alert caps, γ popularity scaling): [Package Scores](https://docs.socket.dev/docs/package-scores).

Legacy score endpoint exposed `depscore` (average of factors) instead of `overall` — ignore for new work.

### Alerts (`alerts[]` when `alerts=true`)

`SocketAlert` highlights:

| Field | Use |
|---|---|
| `type` | Alert type id |
| `severity` | `low` \| `middle` \| `high` \| `critical` |
| `category` | `supplyChainRisk` \| `quality` \| `maintenance` \| `vulnerability` \| `license` \| `other` |
| `action` | Policy action e.g. `error`, `warn`, `ignore` |
| `props` | Type-specific (e.g. `cveId`, `ghsaId`) |

Categories / severity narrative: [Alert Categories](https://docs.socket.dev/docs/package-issues).

### Suggested Packman column UX

1. **Primary cell:** `score.overall` as percent or traffic-light (optional hover: five category scores).
2. **Secondary chip:** count of `critical`/`high` alerts (or worst severity).
3. **Click-through:** `https://socket.dev/npm/package/{name}` or versioned package URL (public site; not an API contract).
4. Skip `licenseattrib` for the column — that flag is for **OSS license attribution text**, not Socket branding ([batch PURL “License Attribution”](https://docs.socket.dev/reference/batchpackagefetchbyorg)).

## ToS / attribution constraints

Primary agreement for Free tier: **Socket Free Terms of Service 2.1.0** (effective 23 March 2026), index at [socket.dev/terms](https://socket.dev/terms), PDF [socket.dev/documents/socket-terms-of-service-2.1.0.pdf](https://socket.dev/documents/socket-terms-of-service-2.1.0.pdf). Enterprise customers use a separate ESLA.

Relevant **Acceptable Use** clauses (paraphrase + implication):

| § | Constraint | Packman implication |
|---|---|---|
| 8 | Replicate Socket data **only** via public APIs provided for that purpose | Use documented REST (`/orgs/.../purl`); treat badge URL as best-effort / undocumented |
| 9 | Do not falsely imply Socket affiliation / endorsement | Label as “Socket score” / “data from Socket”; no “official Socket extension” claim |
| 12–13 | No rate-limit evasion; no unreasonable load | Batch + cache; honor `Retry-After` |
| **14** | Use Socket data only for **personal or internal business** purposes; **may not** give others access/copies/use of Socket data **directly or as part of other products or services** | Highest risk: shipping Socket scores inside a published VS Code/Cursor extension. Safer pattern: each end user supplies **their own** token, accepts Socket Free ToS by using Socket Services, and sees data for **their** work — not Packman redistributing a shared feed |
| 15 | No selling Socket-provided information | Don’t monetize Socket-derived columns as a paid data product |
| 2 | No using Socket data/services to train/improve AI/ML systems | Don’t dump responses into model training corpora |

Also: Socket retains IP in trademarks / logotypes (“Your Content” section); no HTML iframe of the Website (§10).

**Docs gap:** API reference does **not** spell out a required “Powered by Socket” badge. Free ToS §9 + trademark language → attribute clearly; don’t imply endorsement. `licenseattrib` is unrelated (package license texts).

**Speculative (flagged):** Counsel should confirm whether user-keyed, client-side enrichment in an open-source editor extension satisfies §14, or whether a commercial agreement / Socket partnership is needed before Marketplace distribution. This research does not reopen the product decision that Socket columns exist — it only surfaces the legal gate.

## Packman integration sketch

```
settings: socket.apiToken, socket.orgSlug
on UI-mode dependency table load:
  if !token → show “Add Socket API key” / empty column
  else POST /orgs/{orgSlug}/purl?alerts=true
       body: components from resolved name@version (lockfile preferred)
  render score.overall + alert severity rollup
  on 429 → backoff using Retry-After; optionally GET /quota first
```

## Sources

1. https://docs.socket.dev/reference/batchpackagefetchbyorg  
2. https://docs.socket.dev/reference/batchpackagefetch  
3. https://docs.socket.dev/reference/getscorebynpmpackage  
4. https://docs.socket.dev/reference/getissuesbynpmpackage  
5. https://docs.socket.dev/reference/authentication  
6. https://docs.socket.dev/docs/api-keys  
7. https://docs.socket.dev/reference/rate-limits  
8. https://docs.socket.dev/reference/quota  
9. https://docs.socket.dev/reference/getquota  
10. https://docs.socket.dev/reference/socket-package-urls-purl  
11. https://docs.socket.dev/docs/package-scores  
12. https://docs.socket.dev/docs/package-issues  
13. https://docs.socket.dev/docs/socket-python-sdk  
14. https://docs.socket.dev/docs/socket-javascript-sdk  
15. https://socket.dev/terms · https://socket.dev/documents/socket-terms-of-service-2.1.0.pdf  
16. Observed: `https://socket.dev/api/badge/npm/package/{pkg}` (SVG; not in official API index)
