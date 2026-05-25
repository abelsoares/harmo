# Harmo v1 API — Plan

## Context

v0 is a CLI + library. To consume harmo from anywhere else — a dashboard, a journaling app, a notebook — you need an HTTP surface. v1 adds a **query-only** API over the existing aggregate / sample / workout / source / quarantine layers. Ingest (POST endpoints) is explicitly deferred to v2 along with multi-subject and auth.

Everything in this plan is additive to v0. No data-model changes, no destructive migrations, no breaking semantics. The `aggregate()` library function is already API-shaped; this work is mostly transport and contract.

## Goals

- A typed HTTP API that exposes everything you'd want for "build me a dashboard": samples, aggregates, workouts, correlations, sources, registry catalog, import history.
- **Cursor-based pagination** on the only large resource (`samples`).
- A **TypeSpec-defined OpenAPI spec** so we can auto-generate a TypeScript client (`@harmo/api-client`).
- Same patterns as covenantz (Koa + `openapi-backend` + Zod validators inside handlers + Pino logging).
- All endpoints answerable from existing query helpers (`aggregate`, report queries, registry lookups, model tables) — no new database concepts.

## Explicit non-goals (defer to v2+)

- POST/PUT/DELETE endpoints (ingest API). Keep the worker as the sole write path.
- Authentication / authorization. Single hardcoded subject for now.
- Multi-tenant subject routing. `subjectId` is a path param that always equals `'default'` in v1.
- WebSockets / SSE / live tail.
- Rate limiting (single-tenant, behind your laptop).
- CSV / XLSX export. JSON only.
- OpenFGA, Cognito, Stripe, anything else covenantz has but v0 doesn't need.

## Stack

Same as covenantz' `packages/api`:

| Concern | Choice |
|---|---|
| Web framework | Koa 3 + `@koa/router` + `@koa/cors` |
| API contract | TypeSpec → OpenAPI 3.1 |
| Request validation + routing | `openapi-backend` |
| Body / query parsing | `koa-bodyparser` + `koa-qs` (nested query params) |
| Errors | Existing `errorMapper` chain (Zod, DB, generic) + `standard-http-error` |
| Logging | Existing Pino + AsyncLocalStorage `requestId` |
| Observability | Existing Sentry init |
| Tests | Vitest + `supertest` |
| Client generation | `openapicmd typegen` (covenantz pattern) → `@harmo/api-client` package |

No new heavy dependencies. Everything's in the covenantz `packages/api/package.json` already.

## Layout

```
packages/
  core/
    apps/
      api/                              NEW
        index.ts                        Koa app boot + signal handlers
        app.ts                          Composition: middlewares + openapi-backend
    spec/
      main.tsp                          NEW — TypeSpec source
    openapi/
      openapi.yaml                      NEW — generated, committed
    src/
      api/                              NEW — handlers grouped by resource
        health/
          handlers/health-handler.ts
        metrics/
          handlers/list-metrics-handler.ts
        samples/
          handlers/list-samples-handler.ts
          helpers/cursor.ts             cursor encode/decode
        aggregate/
          handlers/aggregate-handler.ts
        workouts/
          handlers/list-workouts-handler.ts
          handlers/get-workout-handler.ts
        correlations/
          handlers/list-correlations-handler.ts
        sources/
          handlers/list-sources-handler.ts
        summary/
          handlers/get-summary-handler.ts
        imports/
          handlers/list-imports-handler.ts
      core/
        clients/request-context.ts      NEW — AsyncLocalStorage requestId
        middlewares/
          access-log-middleware.ts      NEW
          request-id-middleware.ts      NEW
          error-handler-middleware.ts   NEW (wraps existing mapError)
      schemas/
        api/                            NEW — Zod request/response schemas
          common.ts                     pagination, errors, timestamp formats
          samples.ts
          aggregate.ts
          workouts.ts
          correlations.ts
          sources.ts
          summary.ts
  api-client/                            NEW (later in v1)
    package.json                         @harmo/api-client
    src/index.ts                         re-exports the generated client
    src/generated/                       openapicmd output
```

### Reuse from v0

- [`aggregate(knex, input)`](packages/core/src/aggregate/index.ts) — directly wraps `/v1/aggregate`.
- [`collectReport(knex, options)`](packages/core/src/report/queries.ts) — feeds `/v1/summary`.
- [`findMetricByAlias`, `warmRegistry`](packages/core/src/registry/lookup.ts) — feeds `/v1/metrics`.
- All Objection models — feed list endpoints via `.where(...).orderBy(...).limit(...)`.

## Versioning & routing

- All endpoints prefixed with `/v1/`.
- Subject path: `/v1/subjects/:subjectId/...`. In v1, `subjectId = 'default'` is the only legal value; future-proofing for v3.
- Health check at `/v1/health` (no subject).
- Registry catalog at `/v1/metrics` (no subject).

## Endpoints (catalog)

### Health

```
GET /v1/health
  → 200 { status: 'ok', registry_version: 2, db: { connected: true }, started_at: '...' }
```

### Registry catalog

```
GET /v1/metrics
  → 200 {
    registry_version: 2,
    data: [
      {
        metric: 'heart_rate',
        value_kind: 'quantity',
        temporal_kind: 'instant',
        canonical_unit: 'count/min',
        default_agg: 'avg',
        allowed_aggs: ['avg','min','max','latest'],
        resolve_overlap: true
      },
      ...
    ]
  }
```

### Sources

```
GET /v1/subjects/:subjectId/sources
  ?vendor=apple
  ?include_sample_count=true
  → 200 {
    data: [
      { id: '17', vendor: 'apple', source_name: 'Abel's Apple Watch',
        manufacturer: 'Apple Inc.', hardware_version: 'Watch7,9',
        software_version: '11.1', sample_count: 731_279 },
      ...
    ]
  }
```

### Samples (paginated)

```
GET /v1/subjects/:subjectId/samples
  ?metric=heart_rate                  (required)
  &from=2026-05-01T00:00:00Z          (required)
  &to=2026-05-19T00:00:00Z            (required)
  &source_id=17                       (optional, repeatable: ?source_id=17&source_id=22)
  &order=asc|desc                     (default: asc)
  &limit=100                          (default: 100, max: 1000)
  &cursor=<opaque-base64>             (optional)

  → 200 {
    data: [
      { id: '12345', metric: 'heart_rate', value_num: 72, value_text: null,
        unit: 'count/min', start_time: '...', end_time: '...',
        start_offset_minutes: 60, source_id: '17', workout_id: null,
        correlation_id: null, external_id: '...', registry_version: 2,
        metadata: {...}, ingested_at: '...' },
      ...
    ],
    next_cursor: 'eyJ0IjoiMjAyNi0wNS0wMVQwMDowMDowMFoiLCJpIjoxMjM0NX0=' | null
  }
```

**Pagination contract (keyset)**

- Cursor encodes `{ t: ISO timestamp, i: bigint id }` of the last row in the previous page, base64'd.
- Server uses `(start_time, id) > (cursor.t, cursor.i)` for `order=asc` (or `<` for desc).
- Pagination keys map directly to the partitioned-table primary key `(start_time, id)`, so paging never scans a full partition.
- Pages are stable across re-imports (we never reuse ids; `ON CONFLICT DO UPDATE` keeps the same id).
- When `data.length < limit`, `next_cursor = null`.

### Aggregate

```
GET /v1/subjects/:subjectId/aggregate
  ?metric=step_count                  (required)
  &bucket=day                         (required: hour|day|week|month)
  &from=2026-05-01T00:00:00Z          (required)
  &to=2026-05-19T00:00:00Z            (required)
  &agg=sum                            (optional, default = metric.default_agg)
  &timezone=Europe/Lisbon             (optional, default = subjects.timezone)

  → 200 {
    metric: 'step_count',
    bucket: 'day',
    agg: 'sum',
    timezone: 'Europe/Lisbon',
    data: [
      { bucket_start: '2026-04-30T23:00:00Z', value: 12823, sample_count: 1247 },
      ...
    ]
  }
```

Wraps `aggregate()` exactly — same overlap-resolution semantics, same timezone handling, same registry-driven aggregation rules. Errors (unknown metric, disallowed agg, category metric) map to 400.

### Workouts

```
GET /v1/subjects/:subjectId/workouts
  ?from=...&to=...                    (required)
  &activity_type=running              (optional, repeatable)
  &source_id=17                       (optional, repeatable)
  &order=desc                         (default: desc — most-recent-first)
  &limit=100&cursor=...

  → 200 { data: [...], next_cursor: ... }

GET /v1/subjects/:subjectId/workouts/:workoutId
  → 200 {
    id, activity_type, source_id, source_name, start_time, end_time,
    duration_s, external_id, metadata: { rawActivityType, apple: {...},
    children: [...] }
  }
  → 404 if not found
```

### Correlations

```
GET /v1/subjects/:subjectId/correlations
  ?metric=blood_pressure              (optional)
  &from=...&to=...                    (required)
  &include_linked_samples=true        (optional)
  → 200 { data: [...] }
```

`include_linked_samples=true` issues a follow-up query that fetches samples matching the correlation's `(subject_id, source_id, start_time)` keyset and bundles them inline. This is the "give me systolic + diastolic as one unit" use case. Without the flag, only the wrapper is returned.

### Summary (overview)

```
GET /v1/subjects/:subjectId/summary
  ?from=...&to=...                    (optional, defaults to the data's full range)
  → 200 {
    range: { from, to },
    timezone: 'Europe/Lisbon',
    totals: { samples, workouts, correlations, sources, quarantine },
    per_metric: [{ metric, sample_count, first_at, last_at }, ...],
    workouts_by_activity: [{ activity_type, count, total_duration_seconds }, ...]
  }
```

Direct wrapper around `collectReport()`. This endpoint is what powers a "front page" dashboard.

### Import history

```
GET /v1/subjects/:subjectId/imports
  ?limit=50&cursor=...
  → 200 {
    data: [
      { id: '7', status: 'finished', source_file: '...',
        started_at: '...', finished_at: '...', parsed_count: 1173009,
        queued_count: 1173009, error: null },
      ...
    ],
    next_cursor: ...
  }
```

## Response shape conventions

Every list response:
```json
{ "data": [ ... ], "next_cursor": "..." | null }
```

Every single-resource response:
```json
{ "data": { ... } }
```

Errors (HTTP 4xx/5xx):
```json
{ "error": { "code": "unknown_metric", "message": "no metric 'foo' in registry", "details": { ... } } }
```

`code` is a stable lowercase snake-case identifier (`unknown_metric`, `metric_disallowed_agg`, `invalid_cursor`, `unknown_subject`, etc.). `message` is human-readable. `details` is optional and context-specific.

## Time formats

- All timestamps in requests and responses are **ISO 8601 with timezone** (`2026-05-19T07:00:00Z` or `2026-05-19T08:00:00+01:00`).
- Server is timezone-aware via `subjects.timezone` and the `timezone` query param. No reliance on UTC-without-offset strings.

## Validation

- TypeSpec → OpenAPI gives us schema-level validation via `openapi-backend`.
- Inside handlers, the body / query is still re-validated with Zod (`@harmo/common` schemas where they overlap with canonical types). Defense-in-depth.
- Unknown query params → 400 (`unknown_query_param`).
- Malformed cursor → 400 (`invalid_cursor`).

## Errors map

| Source | HTTP | code |
|---|---|---|
| Zod validation failed | 400 | `validation_failed` |
| Unknown metric | 400 | `unknown_metric` |
| Disallowed agg for metric | 400 | `disallowed_agg` |
| Category metric for `/aggregate` | 400 | `metric_is_category` |
| Bad cursor | 400 | `invalid_cursor` |
| Resource not found | 404 | `not_found` |
| Subject not 'default' (v1 stub) | 404 | `unknown_subject` |
| DB error | 500 | `db_error` |
| Anything else | 500 | `internal_error` |

The existing `errorMapper([zodErrorMapper, databaseErrorMapper, unknownErrorMapper])` in [packages/core/src/errors](packages/core/src/errors/index.ts) is the foundation; we add a Koa-level wrapper that maps mapper output to `{ status, body: { error } }`.

## Testing strategy

Same per-worker DB pattern as v0 (Vitest forks pool). Each handler gets:

1. **Happy path** — seed minimal data via existing helpers (`upsertSource`, `ingestCanonical`), hit the endpoint via `supertest`, assert response shape + values.
2. **Validation errors** — bad params, missing required fields, unknown metric, malformed cursor.
3. **Pagination correctness** (samples + workouts) — insert N rows, paginate through, assert no overlap and no gaps, assert `next_cursor=null` on the final page.
4. **Cross-endpoint integration** — at least one test that calls `/v1/summary` then drills into `/v1/aggregate` with the same params and confirms numbers match.

Goal coverage: 80% statements, matching v0.

## Build & dev

Extend [packages/core/esbuild.config.js](packages/core/esbuild.config.js) with `apps/api/index.ts` as a third entrypoint.

New scripts in `packages/core/package.json`:

```json
{
  "api": "tsx --env-file=.env apps/api/index.ts",
  "api:dev": "tsx watch --env-file=.env apps/api/index.ts",
  "typespec:compile": "tsp compile spec/main.tsp",
  "typespec:format": "tsp format spec/**/*.tsp",
  "generate:types": "openapicmd typegen --backend -D openapi/openapi.yaml > src/types/openapi.d.ts",
  "pretest": "npm run db:build && npm run typespec:compile && npm run generate:types"
}
```

Root scripts:
```json
{
  "api": "npm run api --prefix packages/core"
}
```

## Configuration

New env vars on top of v0:
- `SERVER_API_HOSTNAME` (default `0.0.0.0`)
- `SERVER_API_PORT` (default `4001`)
- `CORS_ORIGIN` (default `*` — fine for dev)

## Implementation order (smallest shippable slices)

Each step is a green test run + a curl-able endpoint.

1. **Scaffolding** — Koa app boots, `/v1/health` returns 200. No openapi-backend yet; one hard-coded handler. (~½ day)
2. **TypeSpec + openapi-backend** — generate `openapi.yaml` from a 1-endpoint spec (`/v1/health`), wire `openapi-backend` for routing and validation. (~½ day)
3. **`GET /v1/metrics`** — first real query endpoint, no params, returns the registry. Proves the spec-handler-test loop. (~¼ day)
4. **`GET /v1/aggregate`** — wraps the existing `aggregate()` lib. Adds the first set of validated query params. (~½ day)
5. **`GET /v1/samples`** with cursor pagination — the most subtle one. Keyset cursor helpers + integration tests. (~1 day)
6. **`GET /v1/workouts` (list + by-id)** — straightforward Knex queries. (~½ day)
7. **`GET /v1/correlations`** (with optional `include_linked_samples`). (~½ day)
8. **`GET /v1/sources`** + **`GET /v1/imports`** — small list endpoints. (~¼ day)
9. **`GET /v1/summary`** — wraps `collectReport`. (~¼ day)
10. **`@harmo/api-client` package** — `openapicmd typegen` + thin convenience wrapper (`new HarmoClient({ baseUrl })`). (~½ day)
11. **Integration tests + lint pass**. (~½ day)

Total: ~5–6 days at a reasonable pace.

## Verification (v1 done when)

- `npm run api` starts on `:4001`. `curl http://localhost:4001/v1/health` returns 200.
- `curl 'http://localhost:4001/v1/subjects/default/aggregate?metric=step_count&bucket=day&from=2026-05-01T00:00:00Z&to=2026-05-19T00:00:00Z&timezone=Europe/Lisbon'` returns the same numbers as the May 2026 spot-check sheet.
- Samples endpoint paginates correctly through 100k+ heart-rate samples (verified by integration test).
- `openapi/openapi.yaml` is committed, in sync with TypeSpec.
- `@harmo/api-client` builds and imports cleanly into a sibling Node script.
- All v0 tests still pass. New v1 tests pass. Lint + typecheck clean.

## Out of scope, captured for later

- **Ingest API (`POST /v1/subjects/.../samples`)** — once we have the canonical contract proven via the query side, the POST side mirrors it. Will need: auth, rate limiting, body validation, transaction boundary, deduplication semantics.
- **Multi-subject + auth** — v3.
- **Webhook ingestion (real-time push from wearables / live-sync apps)** — needs subject identity first.
- **CSV/XLSX export** — easy add once query endpoints stabilize; just adds `Accept: text/csv` handling per endpoint.
- **GraphQL surface** — explicit non-goal. JSON+OpenAPI is enough and easier to type.
