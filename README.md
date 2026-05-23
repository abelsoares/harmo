# harmo

Canonical health-data ingestion + normalization platform. See [docs/HEALTH_PLATFORM_DESIGN.md](docs/HEALTH_PLATFORM_DESIGN.md) for the product vision, [USER_STORIES.md](USER_STORIES.md) for the iterative backlog, and the v0 plan at `~/.claude/plans/so-we-are-working-stateless-ocean.md`.

## Status

Bootstrap is in place. Migrations apply, the registry is seeded, and the three apps boot. All feature logic (XML parsing, normalization, ingest, aggregation, replay) is still stubbed — see [USER_STORIES.md](USER_STORIES.md) for the next iterations.

## Quickstart

```bash
nvm use
npm install
npm run db:up              # docker compose: postgres + pgmq on :5433
npm run db:migrate         # schema + registry seed
npm test                   # smoke tests (DB up, partitions, registry, pgmq)

npm run cli -- registry:show
npm run worker             # idle-poll the ingest queue (stub)
npm run importer -- --file ~/Downloads/export.xml   # stub
```

## Layout

```
packages/
  common/                  @harmo/common — schemas, canonical types, registry seed
  core/                    @harmo/core
    apps/importer/         Apple Health XML → pgmq (stub)
    apps/worker/           pgmq → normalize → ingest (stub)
    apps/cli/              admin commands
    bin/db-reset.ts        wipe the dev DB
    migrations/            knex migrations
    src/clients/           env, knex, pgmq, logger, sentry
    src/models/            Objection models
    src/normalize/         vendor-first dispatch + Apple parsers (stub)
    src/ingest/            canonical upsert + source cache (stub)
    src/aggregate/         registry-aware aggregation (stub)
    src/quarantine/        unparseable / pre-aggregated row store
    src/registry/          alias and unit lookup helpers
docs/HEALTH_PLATFORM_DESIGN.md
USER_STORIES.md
docker-compose.yml         postgres 17 + pgmq, exposed on :5433
```

## Configuration

Environment variables live in `packages/core/.env` (dev) and `packages/core/.env.test` (test runner). See `.env.example` for the schema. The Docker postgres is on host port `5433` so it can coexist with other local Postgres instances.
