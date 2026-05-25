# Harmo — User Stories (v0)

> **Status (2026-05-25):** v0 is functional end-to-end. Real 512 MB Apple export ingested in 43 s → 1.17M samples + 160 workouts + 30 correlations. Registry expanded to 75 canonical metrics. HTML report generator (with calendar heatmap, charts, stats cards) ships at 460 KB. 113 tests passing + 1 opt-in e2e. **Shipped:** US-1a, US-1b, US-2, US-3, US-4, US-5, US-6, US-7, US-8, US-9, US-10, US-11, US-12, US-13, US-14, US-15, US-16, US-17. **Partial:** US-18 (most checklist items covered by existing tests). **Open:** US-19 (Apple-Health-app spot-check). Plus bonus work: registry v2 expansion (11→75 metrics), `--inline` bulk importer + warm-registry cache, HTML report generator, calendar heatmap, cross-metric dedup index fix.

The bootstrap is in place: monorepo scaffolded, schema migrated, registry seeded, three apps boot. Everything below is the remaining feature work, sliced so each story is shippable on its own (tests green, app still runs).

Stories reference the v0 plan at `~/.claude/plans/so-we-are-working-stateless-ocean.md` and the design doc at [docs/HEALTH_PLATFORM_DESIGN.md](docs/HEALTH_PLATFORM_DESIGN.md). They're grouped by epic. Within an epic, stories are ordered by dependency.

Each story includes:
- **Value** — why we're doing it
- **Done when** — acceptance criteria
- **Touches** — likely files/modules
- **Depends on** — prior stories (if any)

---

## Epic 0 — Bootstrap ✅

Already done in this session:
- Monorepo (`@harmo/common`, `@harmo/core`), Node 24, npm 11 workspaces, Biome, esbuild.
- Postgres 17 + `pgmq` extension via docker-compose on `:5433`.
- v0 schema migrated: `subjects`, `sources`, `metrics_registry`, `metric_aliases`, `unit_conversions`, `source_priority`, `workouts`, `correlations`, `samples` (monthly RANGE partitions 2018-now+1), `quarantine`, `import_runs`.
- Registry seeded with 11 metrics + Apple aliases + unit conversions.
- Three apps boot: `importer`, `worker`, `cli`. Smoke tests cover DB, partitioning, registry, pgmq.

---

## Epic 1 — XML import & queue ingestion

> **Real-data findings from `docs/apple_health_export/export.xml` (512 MB).** Counts: 1,172,433 `Record`, 4,251 `HeartRateVariabilityMetadataList`, 589 `WorkoutStatistics`, 585 `WorkoutEvent`, 506 `ActivitySummary`, 160 `Workout`, 55 `WorkoutRoute`/`FileReference` pairs, 30 `Correlation`, 3 `WorkoutActivity`. The DTD explicitly notes: *"Any Records that appear as children of a correlation also appear as top-level records in this document."* — so Correlation children are duplicates of standalone Records. `WorkoutActivity` is a nested container (multi-level). HRV records carry inline `<InstantaneousBeatsPerMinute>` lists. Timestamps are `YYYY-MM-DD HH:MM:SS ±HHMM` (space-separated, not ISO-T). `Me` and `ExportDate` appear once each at the top.

### US-1a — Apple timestamp parser + streaming skim
**Value.** Validate the two risky building blocks on the *real* 512 MB file before piling on envelope-shape complexity: (a) Apple's non-ISO timestamp format and (b) a SAX-to-async-iterable bridge with backpressure that survives a million-element stream without OOM.

**Done when.**
- `parseAppleTimestamp(str): { utc: Date; offsetMinutes: number }` exists with explicit regex parsing. Tests cover `+0100`, `+0000`, negative offsets, the DST-day transition in `Europe/Lisbon`, and malformed input (throws).
- `skimAppleExport(stream): AsyncIterable<{ kind: string }>` exists. Emits one event per opening tag (no depth filtering — we want raw element counts that match grep). Uses lenient SAX so Apple's 200-line DTD is ignored. Bridges to async iterable with a bounded queue + `input.pause()/resume()` for backpressure.
- A CLI command `harmo apple:skim --file <path>` tallies kinds and prints a count table.
- **Acceptance check against the real export:** counts match `Record: 1172433, Workout: 160, Correlation: 30, ActivitySummary: 506, WorkoutEvent: 585, WorkoutStatistics: 589, WorkoutRoute: 55, FileReference: 55, WorkoutActivity: 3, HeartRateVariabilityMetadataList: 4251`. Process RSS stays under 256 MB.

**Touches.** [packages/core/src/normalize/apple/timestamp.ts](packages/core/src/normalize/apple/timestamp.ts), [packages/core/src/normalize/apple/skim.ts](packages/core/src/normalize/apple/skim.ts), [packages/core/apps/cli/index.ts](packages/core/apps/cli/index.ts), `test/normalize/apple/`.

---

### US-1b — Full envelope parser
**Value.** Once US-1a proves the plumbing, turn the skim into a typed envelope stream the importer can ship to pgmq.

**Done when.**
- `parseAppleExport(stream): AsyncIterable<RawApplePayload>` exists, returning the existing [`RawEnvelopeSchema`](packages/common/src/schemas/sample.ts) `payload` shape.
- Top-level kinds emitted: `Record`, `Workout`, `Correlation`, `ActivitySummary`, `ClinicalRecord`, `Audiogram`, `VisionPrescription`, plus informational `Me` and `ExportDate` envelopes.
- `Record`: `<MetadataEntry/>` children fold into `metadata`; `<HeartRateVariabilityMetadataList>` and its `<InstantaneousBeatsPerMinute>` children captured verbatim under `children`.
- `Workout`: recursive child capture so `WorkoutActivity > WorkoutEvent` survives as a tree, not a flat list.
- `Correlation`: **emit attrs + metadata only, no child Records captured** — the DTD note tells us those Records re-appear standalone at top level; US-5 will link them post-hoc by `(subject_id, source_id, start_time, type)`.
- `WorkoutRoute > FileReference`: kept as nested child; GPX parsing stays deferred.
- 5 fixtures under `test/fixtures/apple/`: `bp-correlation.xml`, `running-workout.xml`, `multi-activity-workout.xml`, `hrv-with-beats.xml`, `dtd-header-only.xml`.
- **End-to-end test against the real export:** total envelope count per kind matches the US-1a skim numbers exactly (proves we don't drop anything when we add envelope assembly).

**Touches.** [packages/core/src/normalize/apple/parser.ts](packages/core/src/normalize/apple/parser.ts) (new), `test/fixtures/apple/`, `test/normalize/apple/parser.test.ts`.

**Depends on.** US-1a.

---

### US-2 — Importer pumps envelopes into pgmq + tracks `import_runs`
**Value.** Move XML parsing from synchronous-in-place to durable async work, exactly the climate-tech-etl idempotency pattern.

**Done when.**
- `npm run importer -- --file <path>` opens an `import_runs` row (`status=running`), streams envelopes from US-1b, calls `pgmq.send_batch('ingest_q', …)` in batches of `INGEST_BATCH_SIZE`.
- On finish: updates `parsed_count`, `queued_count`, `finished_at`, `status=finished`.
- On error: `status=failed`, `error` populated; partial progress kept.
- Re-running the same file is safe (duplicates land in the queue but dedup catches them downstream).

**Touches.** [packages/core/apps/importer/index.ts](packages/core/apps/importer/index.ts), [packages/core/src/models/import-run-model.ts](packages/core/src/models/import-run-model.ts).

**Depends on.** US-1b.

---

## Epic 2 — Vendor normalization

### US-3 — Apple `Record` → canonical sample
**Value.** First real ingestion path. Proves the registry-driven alias + unit-conversion design works on real Apple types.

**Done when.**
- `normalizeAppleRecord()` looks up `HKQuantityType…` / `HKCategoryType…` via `metric_aliases`; falls back to quarantine `unknown_alias`.
- Quantity records: parse `value` → number, convert from raw `unit` to `canonical_unit` via `unit_conversions`; quarantine `unit_unknown` if no conversion.
- Category records: store `value_text`, `value_num=null`.
- Preserve the source's UTC offset in `start_offset_minutes` (Apple's `startDate` ends with `+0100` style).
- Compute `external_id`: prefer `HKMetadataKeyExternalUUID` from metadata; else `sha256(payload-canonical)`.
- Upsert the `sources` row (US-7 covers the cache; here just inline).
- Unit tests cover: heart rate (`bpm`→`count/min`), step count, distance (`mi`→`km`), body mass (`lb`→`kg`), sleep analysis category.

**Touches.** [packages/core/src/normalize/apple/record.ts](packages/core/src/normalize/apple/record.ts), [packages/core/src/registry/lookup.ts](packages/core/src/registry/lookup.ts).

**Depends on.** US-2.

---

### US-4 — Apple `Workout` → `workouts` row + child sample linkage
**Value.** Workouts are first-class. Child samples in the XML between `<Workout>` and `</Workout>` need to FK to the workout row.

**Done when.**
- `normalizeAppleWorkout()` writes a row to `workouts` (idempotent via `(subject_id, source_id, external_id)`).
- The parser (US-1) yields workout children with parent context so the worker can set `workout_id` on each emitted sample envelope.
- Canonical `activity_type` mapping (e.g. `HKWorkoutActivityTypeCycling` → `cycling`) added to the registry (new alias table or inline map — decide and document).
- Tests: a small workout fragment yields one `workouts` row and N samples linked to it.

**Touches.** [packages/core/src/normalize/apple/workout.ts](packages/core/src/normalize/apple/workout.ts), parser from US-1.

**Depends on.** US-1, US-3.

---

### US-5 — Apple `Correlation` → `correlations` wrapper
**Value.** Blood pressure (and a few other bundles) ships as a Correlation wrapping two Records. We need to preserve that grouping.

**Done when.**
- `normalizeAppleCorrelation()` writes a `correlations` row keyed by `(subject_id, source_id, external_id)`.
- Child samples emitted with `correlation_id` set.
- Aggregation can fetch `correlations` to assemble systolic+diastolic pairs (this is a query-side detail; not required here, just the storage).

**Touches.** [packages/core/src/normalize/apple/correlation.ts](packages/core/src/normalize/apple/correlation.ts), parser.

**Depends on.** US-1, US-3.

---

### US-6 — `ActivitySummary` and other pre-aggregated rows → quarantine
**Value.** Design doc is explicit: never naively merge pre-aggregated rollups; preserve them for replay.

**Done when.**
- Dispatch already routes `ActivitySummary` to `{ kind: 'quarantine', reason: 'pre_aggregated' }`; the worker calls `storeQuarantine()` with the raw envelope.
- Test asserts a fixture with an `ActivitySummary` element lands in `quarantine` and **not** in `samples`.

**Touches.** [packages/core/apps/worker/index.ts](packages/core/apps/worker/index.ts), [packages/core/src/quarantine/store.ts](packages/core/src/quarantine/store.ts).

**Depends on.** US-2.

---

## Epic 3 — Canonical ingestion & dedup

### US-7 — Source upsert with identity-hash LRU cache
**Value.** Apple exports cite the same device thousands of times. Without caching, every record costs a roundtrip.

**Done when.**
- `upsertSource()` computes `identity_hash = sha256(vendor|name|hardware|product)`, returns the `sources.id` (bigint).
- A per-worker LRU keyed by `identity_hash` keeps the last ~1k seen.
- `ON CONFLICT (subject_id, identity_hash) DO UPDATE` refreshes `software_version` if changed.
- Test: re-upserting the same source 100 times produces one row + 99 cache hits.

**Touches.** [packages/core/src/ingest/source-cache.ts](packages/core/src/ingest/source-cache.ts).

---

### US-8 — Batched canonical sample upsert (dedup tuple)
**Value.** This is the heart of the system. Idempotency, last-write-wins, and partition-safe.

**Done when.**
- `ingestCanonical(knex, samples)` issues a single `INSERT INTO samples (…) VALUES …, …, … ON CONFLICT (subject_id, source_id, external_id, start_time) DO UPDATE SET value_num = EXCLUDED.value_num, value_text = EXCLUDED.value_text, metadata = EXCLUDED.metadata, ingested_at = now(), registry_version = EXCLUDED.registry_version`.
- Returns `{ inserted, updated }` based on `xmax = 0` trick or `RETURNING (xmax = 0) AS inserted`.
- Batches of ~500.
- Test: ingest a fixture twice → row count stable; second pass's `updated` matches first pass's `inserted`; `ingested_at` advances.

**Touches.** [packages/core/src/ingest/canonical.ts](packages/core/src/ingest/canonical.ts).

**Depends on.** US-7.

---

### US-9 — Worker wiring: dispatch → ingest → archive (+ DLQ on retry exhaust)
**Value.** Stitches Epics 1-3 together; this is when the importer→worker pipe actually moves data.

**Done when.**
- Worker reads `WORKER_POLL_BATCH` messages with `vt=WORKER_VT_SECONDS`.
- For each: `dispatchNormalize()` → either `ingestCanonical([sample])` (or workout/correlation handlers) or `storeQuarantine()`; then `pgmq.archive`.
- On thrown error: leave the message; pgmq's `vt` retries it. After `read_ct >= 5`, move to `quarantine` with reason `dlq` and archive.
- Graceful drain on SIGTERM (already in place).
- Integration test: enqueue a batch of fixtures, run one poll, assert `samples` + `quarantine` rows, then re-poll and assert idempotency.

**Touches.** [packages/core/apps/worker/index.ts](packages/core/apps/worker/index.ts), [packages/core/src/clients/pgmq.ts](packages/core/src/clients/pgmq.ts).

**Depends on.** US-3..US-8.

---

## Epic 4 — Aggregation library

### US-10 — `aggregate()` core (registry-aware, no overlap)
**Value.** A working aggregate query proves the canonical contract is usable.

**Done when.**
- `aggregate({ subjectId, metric, bucket, from, to, agg?, timezone? })` returns `{ bucketStart, value, sampleCount }[]`.
- Looks up `metrics_registry` row: validates `agg ∈ allowed_aggs`; falls back to `default_agg`.
- Effective timezone: param > `subjects.timezone` > `'UTC'`.
- SQL uses `date_trunc($bucket, start_time AT TIME ZONE $tz)`.
- Test: known fixtures produce expected hourly+daily values.

**Touches.** [packages/core/src/aggregate/index.ts](packages/core/src/aggregate/index.ts).

**Depends on.** US-8.

---

### US-11 — Source-priority overlap resolution
**Value.** Watch + phone reporting steps for the same minute is the canonical correctness trap. The design's bar is that we never double-count.

**Done when.**
- When `metrics_registry.resolve_overlap=true`, `aggregate()` uses the windowed `ROW_NUMBER()` plan from the v0 plan to pick the highest-priority source per minute before reducing.
- `source_priority` is honored; missing entries default to lowest priority.
- Tunable window (default 1 minute) lives in code, not in the registry yet.
- Test: a 60-second minute with watch (rank 1, 10 steps) + phone (rank 2, 14 steps) yields 10 steps, not 24.

**Touches.** [packages/core/src/aggregate/index.ts](packages/core/src/aggregate/index.ts).

**Depends on.** US-10.

---

### US-12 — DST + timezone correctness
**Value.** The design doc lists day-boundary math as the #3 open question. Validate it before declaring v0 done.

**Done when.**
- Test: aggregating `step_count` for `2024-03-31` in `Europe/Lisbon` produces a 23-hour day, not 24; per-hour buckets show the DST jump (or omission) clearly.
- Test: cross-tz override (subject is `Europe/Lisbon`, query `--timezone UTC`) yields different bucket boundaries on the same samples.
- Document the verified algorithm in [docs/HEALTH_PLATFORM_DESIGN.md](docs/HEALTH_PLATFORM_DESIGN.md) "Open Questions → O3 (resolved)".

**Depends on.** US-10.

---

## Epic 5 — CLI completeness

### US-13 — `samples:count` / `samples:peek`
**Value.** Sanity-checking after every import; trivial but high-leverage.

**Done when.**
- `samples:count --subject default` returns the row count.
- `samples:peek --metric heart_rate --since 2024-01-01 --limit 20` lists recent canonical rows with their source name + unit.
- Both use the same Knex client; no Objection magic required.

**Touches.** [packages/core/apps/cli/index.ts](packages/core/apps/cli/index.ts).

---

### US-14 — `aggregate` CLI subcommand
**Value.** Lets us verify US-10/US-11/US-12 by hand against the Apple Health app.

**Done when.**
- `harmo aggregate --metric step_count --bucket day --since 2024-03-01 --until 2024-04-01 --timezone Europe/Lisbon` prints a table of `(bucket_start, value, sample_count)` rows.
- Calls the same `aggregate()` library function that v1's API will use — no duplication.

**Touches.** [packages/core/apps/cli/index.ts](packages/core/apps/cli/index.ts).

**Depends on.** US-10.

---

### US-15 — `replay-quarantine`
**Value.** Bumping `REGISTRY_VERSION` is the v0 way to fix normalization mistakes. Replay must work or quarantine grows forever.

**Done when.**
- `harmo replay-quarantine --reason unknown_alias --since 2024-01-01 [--dry-run]` lists matching rows; without `--dry-run` re-enqueues their `raw` payload to `pgmq.ingest_q`, then deletes the `quarantine` row only after a successful enqueue.
- `--reason dlq` covers retry-exhaust messages.
- Test: quarantine 3 rows, add a missing alias, bump registry version, replay → 3 rows now in `samples`.

**Touches.** [packages/core/apps/cli/index.ts](packages/core/apps/cli/index.ts), [packages/core/src/quarantine/store.ts](packages/core/src/quarantine/store.ts).

**Depends on.** US-9.

---

### US-16 — `import_runs` status + resume safety
**Value.** A 2GB XML import that crashes halfway should be obvious in the CLI, and re-running should not double-count.

**Done when.**
- `harmo imports:list` shows recent runs (status, counts, timing).
- Running `importer` while another run is `running` for the same `--file` prints a warning and exits non-zero (use `pg_try_advisory_lock` or a unique partial index on `source_file WHERE status='running'`).
- Idempotency: re-running a finished import is a no-op for `samples` (dedup catches it) and inserts a fresh `import_runs` row.

**Touches.** importer, cli.

**Depends on.** US-2, US-8.

---

## Epic 6 — Quality bar

### US-17 — Apple fixture library + worker integration tests
**Value.** All previous stories ship faster with shared fixtures. This story extracts what's been ad-hoc into reusable fixtures.

**Done when.**
- `test/fixtures/apple/*.xml` contains small (≤30 lines each) captures: one heart-rate run, one step-count run, one workout w/ children, one correlation, one ActivitySummary, one DTD-laden file head.
- Helper `enqueueFromFixture(name)` parses the fixture and enqueues envelopes.
- Helper `runOneWorkerCycle()` calls `pollOnce()` once and returns the message count.
- At least one full integration test wires them: fixture → importer → worker → assertions on `samples`, `workouts`, `correlations`, `quarantine`.

**Touches.** `test/fixtures/apple/`, `test/helpers/`.

---

### US-18 — Aggregation correctness suite
**Value.** Locks the design-doc quality bar.

**Done when.**
- Five tests, each captured from the v0 plan's checklist:
  1. Overlap-resolved minute equals priority source.
  2. Re-import of the same XML keeps `samples` row count unchanged.
  3. `ActivitySummary` lands in `quarantine` only.
  4. Raw unit `mi` → canonical `km` in `value_num`.
  5. DST day in `Europe/Lisbon` is 23 hours.
- A reproduction script can be re-run from a clean DB in one command.

**Depends on.** US-3, US-8, US-9, US-11, US-12.

---

### US-19 — Personal-export idempotency replay
**Value.** The design doc's gold standard: prove v0 on real personal data.

**Done when.**
- Documented workflow in `README.md`: drop your `export.xml` into a scratch dir, run importer + worker, then re-run; row counts and aggregates are identical.
- Spot-checks against the Apple Health app (daily steps for one month) match within tolerance.
- Any surprises that surface become new GitHub-tracked tasks (or new US tickets here).

**Depends on.** all prior stories.

---

## How to use this file

1. Pick the next undone story (top-down within an epic).
2. Read the "Done when" criteria.
3. Confirm or revise scope with the user before implementing.
4. Implement → tests → `npm run check && npm run typecheck && npm test`.
5. Mark the story done here (move heading to a "Shipped" section, or strike-through) and commit.

Iterate on size if a story is too large: split US-3 by metric type, US-9 by retry semantics, etc. Each split should still be independently shippable.
