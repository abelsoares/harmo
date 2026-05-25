# harmo

Canonical health-data ingestion + normalization platform. See [docs/HEALTH_PLATFORM_DESIGN.md](docs/HEALTH_PLATFORM_DESIGN.md) for the product vision and [USER_STORIES.md](USER_STORIES.md) for the iterative backlog.

## Status

v0 functional. Imports the real 512 MB personal Apple Health export end-to-end in ~43 seconds, normalizes against 75 canonical metrics, and renders a self-contained HTML report. 113 unit/integration tests + 1 opt-in e2e against the real export. Lint + typecheck clean.

## Quickstart

```bash
nvm use
npm install
npm run db:up              # docker compose: postgres 17 + pgmq on :5433
npm run db:migrate         # schema + registry seed (v2)
npm test                   # 113 tests
```

## The end-to-end workflow

Drop your Apple Health `export.xml` somewhere on disk, then:

```bash
# Bulk import (skips pgmq for speed — 28k envelopes/sec).
npm run importer -- --file /path/to/export.xml --inline

# Option A — render a static self-contained HTML report.
npm run cli -- report --out /tmp/harmo-report.html --open

# Option B — start the API + interactive React dashboard.
npm run api          # terminal 1: Koa on :4001
npm run dashboard    # terminal 2: Vite + React on :5173
```

The import is idempotent — re-running on the same file leaves `samples` unchanged (dedup tuple catches it). An advisory lock prevents two concurrent imports of the same file.

### What you get

Reading the report, you'll see:

- **Overview cards**: total samples, workouts (with total duration), sources, total steps + daily avg, avg/min/max heart rate, active energy, distance, latest body mass.
- **Activity heatmaps**: GitHub-style calendar of steps + workouts over the last 365 days.
- **Charts**: steps/day, active energy/day, Apple Stand & Exercise time, heart rate (adaptive bucket: hour/day/week based on range), resting HR + VO₂ max trends, body mass.
- **Workouts**: by activity type with total duration, recent workouts list.
- **Sleep categories** + per-source sample contribution + full metric breakdown with rate (samples/day).

### Other CLI commands

```bash
# What's in the registry today?
npm run cli -- registry:show

# Quick row counts and peek-by-metric.
npm run cli -- samples:count
npm run cli -- samples:peek --metric heart_rate --since 2025-01-01 -n 10

# Aggregate library exposed as a CLI for spot-checking.
npm run cli -- aggregate --metric step_count --bucket day \
  --from 2025-01-01 --to 2025-02-01 --timezone Europe/Lisbon

# Recent import runs.
npm run cli -- imports:list

# Why are some rows in quarantine? Look first.
npm run cli -- replay-quarantine --dry-run
# Then after extending the registry (or fixing a bug), push them back through:
npm run cli -- replay-quarantine --reason unknown_alias --inline

# Stream the XML to count envelopes per kind (no DB writes).
npm run cli -- apple:skim --file /path/to/export.xml
```

### Re-importing & registry bumps

The registry lives in two places: TypeScript source in [packages/common/src/registry/](packages/common/src/registry/) and DB tables (`metrics_registry`, `metric_aliases`, `unit_conversions`). They're synchronized via a Knex migration. To add a new metric:

1. Edit `packages/common/src/registry/metrics.ts` (add definition) and `aliases.ts` (add mapping). Bump `REGISTRY_VERSION`.
2. Create a new migration file in `packages/core/migrations/` whose `up()` inlines the new arrays. Migrations are frozen snapshots — never import from `@harmo/common` here.
3. Run `npm run db:migrate`.
4. `npm run cli -- replay-quarantine --reason unknown_alias --inline` — old quarantined rows that match the new aliases flow into samples.

A `registry-drift.test.ts` smoke test asserts the live TS arrays match the seeded DB rows row-for-row. If you edit the TS without writing a migration, that test breaks.

## Architecture at a glance

```
Apple Health export.xml
        │
        ▼
parseAppleExport (SAX → AsyncIterable<RawApplePayload>)
        │
        ├─→ pgmq.ingest_q  ──→  worker.processMessage  (default path; pgmq round-trip)
        │
        └─→ BulkProcessor  (--inline path; skips pgmq, batches sample upserts)
                │
                ▼
        dispatchNormalize → normalizeApple{Record,Workout,Correlation}
                │
                ▼
        upsertSource (LRU cache) + ingestCanonical (batched INSERT … ON CONFLICT)
                │
                ▼
        PostgreSQL: samples (partitioned monthly), workouts, correlations,
                    sources, quarantine, import_runs
```

Key invariants:
- **Vendor-first dispatch**: `dispatchNormalize` picks `apple|...|` by `envelope.vendor`; per-vendor sub-dispatch by element kind.
- **Registry is the single source of truth** for canonical metric keys, units, temporal kind, allowed aggregations, and overlap-resolution flag. Consumed by both ingest and aggregate paths.
- **Dedup tuple**: `(subject_id, source_id, metric, external_id, start_time)` — `metric` is in the key because some vendors (Strava, Withings) ship multiple metric records under one `HKExternalUUID`.
- **Last-write-wins** via `ON CONFLICT … DO UPDATE` for samples; the importer treats re-imports as no-ops at the sample level.

## Layout

```
packages/
  common/                       @harmo/common — schemas, canonical types, registry seed
  core/                         @harmo/core
    apps/importer/              Apple Health XML → pgmq (or --inline)
    apps/worker/                pgmq → normalize → ingest, with DLQ
    apps/cli/                   admin commands (registry:show, samples:peek/count,
                                aggregate, apple:skim, report, replay-quarantine,
                                imports:list)
    bin/db-reset.ts             wipe the dev DB
    migrations/                 knex migrations (frozen snapshots)
    src/clients/                env, knex, pgmq, logger, sentry
    src/models/                 Objection models
    src/normalize/              vendor-first dispatch + Apple parsers
    src/ingest/                 canonical upsert + source-cache + bulk processor
    src/aggregate/              registry-aware aggregation + overlap resolution
    src/quarantine/             store + replay
    src/registry/               alias / unit lookup helpers + in-memory cache
    src/report/                 query + HTML render
    src/worker/                 process-message + retry / DLQ
docs/HEALTH_PLATFORM_DESIGN.md  product spec
USER_STORIES.md                 backlog
docker-compose.yml              postgres 17 + pgmq on :5433
```

## Configuration

Environment variables live in `packages/core/.env` (dev) and `packages/core/.env.test` (test runner). See `.env.example` for the schema. Docker postgres is on host port `5433` so it doesn't collide with other local Postgres instances.

## Performance (real-data benchmarks)

- **Inline import**: 1.17M envelopes parsed + normalized + bulk-inserted in **43 seconds** (~28k envelopes/s).
- **Replay quarantine** (456k rows back through the normalize pipeline): **20 seconds**.
- **HTML report** against 1.17M samples + 75 metrics: **3 seconds**.
- **Tests**: 113 + 1 opt-in e2e in **~8 seconds**.

## Verification (v0 done = all green)

1. `docker compose up -d` → `npm run db:migrate` succeeds; tables created, partitions present, registry v2 seeded.
2. `npm run importer -- --file ~/export.xml --inline` ingests an Apple Health export end-to-end. `import_runs` row shows `status=finished`.
3. `harmo samples:count` returns >0; `harmo samples:peek --metric heart_rate --since 2025-01-01` returns canonical-unit values.
4. Re-running `harmo importer --inline` on the same file leaves `samples` row count unchanged (dedup proof).
5. `harmo aggregate --metric step_count --bucket day --from 2025-01-01 --to 2025-02-01` returns daily totals that match the Apple Health app within tolerance.
6. `ActivitySummary` elements land in `quarantine` with `reason='pre_aggregated'`; nothing in `samples` references them.
7. `harmo replay-quarantine --reason unknown_alias --inline` after a registry expansion converts quarantined rows into samples.
8. `npm test` passes (113 tests) including DST day-boundary and source-priority overlap tests.
9. `npm run check && npm run typecheck` both clean.
