import { buildApp } from '@apps/api/index';
import type { CanonicalSample, CanonicalSource } from '@harmo/common';
import { INGEST_QUEUE } from '@harmo/common';
import { getKnex } from '@src/clients';
import { ingestCanonical } from '@src/ingest/canonical';
import { computeSourceIdentityHash, resetSourceCache, upsertSource } from '@src/ingest/source-cache';
import { upsertWorkout } from '@src/ingest/workout';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeQueue } from './helpers/pgmq';

async function resetState() {
  resetSourceCache();
  const knex = getKnex();

  await knex('samples').delete();
  await knex('correlations').delete();
  await knex('workouts').delete();
  await knex('quarantine').delete();
  await knex('source_priority').delete();
  await knex('sources').delete();
  await knex('import_runs').delete();
  await purgeQueue(knex, INGEST_QUEUE);
}

function source(name = 'TestSource'): CanonicalSource {
  return {
    subjectId: 'default',
    vendor: 'apple',
    sourceName: name,
    manufacturer: 'TestCo',
    hardwareVersion: 'v1',
    softwareVersion: '1.0',
    productType: 'phone',
    identityHash: computeSourceIdentityHash({
      vendor: 'apple',
      sourceName: name,
      hardwareVersion: 'v1',
      productType: 'phone'
    })
  };
}

function sampleAt(
  sourceId: bigint,
  metric: string,
  isoTime: string,
  value: number,
  externalId: string,
  unit = 'count'
): CanonicalSample {
  return {
    subjectId: 'default',
    metric,
    valueNum: value,
    valueText: null,
    unit,
    startTime: new Date(isoTime),
    endTime: new Date(isoTime),
    startOffsetMinutes: 0,
    sourceId,
    workoutId: null,
    correlationId: null,
    externalId,
    registryVersion: 2,
    metadata: {}
  };
}

const app = buildApp();
const server = app.callback();

describe('v1 API', () => {
  beforeEach(resetState);

  it('GET /v1/health returns ok and registry version', async () => {
    const res = await request(server).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.registry_version).toBeGreaterThan(0);
    expect(res.body.data.db.connected).toBe(true);
  });

  it('GET /v1/metrics returns the registry', async () => {
    const res = await request(server).get('/v1/metrics');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(10);
    expect(res.body.data.some((m: { metric: string }) => m.metric === 'heart_rate')).toBe(true);
  });

  it('GET /v1/subjects/default/aggregate returns daily sums', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2026-05-01T10:00:00Z', 5000, 'a'),
      sampleAt(sourceId, 'step_count', '2026-05-01T15:00:00Z', 3000, 'b'),
      sampleAt(sourceId, 'step_count', '2026-05-02T10:00:00Z', 7000, 'c')
    ]);

    const res = await request(server).get('/v1/subjects/default/aggregate').query({
      metric: 'step_count',
      bucket: 'day',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-03T00:00:00Z',
      timezone: 'UTC'
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].value).toBe(8000);
    expect(res.body.data[1].value).toBe(7000);
  });

  it('GET /v1/subjects/default/aggregate returns 400 for unknown metric', async () => {
    const res = await request(server)
      .get('/v1/subjects/default/aggregate')
      .query({ metric: 'made_up', bucket: 'day', from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_metric');
  });

  it('GET /v1/subjects/default/aggregate returns 400 for disallowed agg', async () => {
    const res = await request(server).get('/v1/subjects/default/aggregate').query({
      metric: 'step_count',
      bucket: 'day',
      agg: 'avg',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-02T00:00:00Z'
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('disallowed_agg');
  });

  it('GET /v1/subjects/default/samples paginates via cursor', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());
    const samples = Array.from({ length: 7 }, (_, i) =>
      sampleAt(sourceId, 'heart_rate', `2026-05-01T10:0${i}:00Z`, 60 + i, `ext-${i}`, 'count/min')
    );

    await ingestCanonical(knex, samples);

    const first = await request(server)
      .get('/v1/subjects/default/samples')
      .query({ metric: 'heart_rate', from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z', limit: 3 });

    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(3);
    expect(first.body.next_cursor).toBeTruthy();

    const second = await request(server).get('/v1/subjects/default/samples').query({
      metric: 'heart_rate',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-02T00:00:00Z',
      limit: 3,
      cursor: first.body.next_cursor
    });

    expect(second.body.data).toHaveLength(3);
    expect(second.body.next_cursor).toBeTruthy();

    const third = await request(server).get('/v1/subjects/default/samples').query({
      metric: 'heart_rate',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-02T00:00:00Z',
      limit: 3,
      cursor: second.body.next_cursor
    });

    expect(third.body.data).toHaveLength(1);
    expect(third.body.next_cursor).toBeNull();

    // No overlap across pages.
    const ids = [...first.body.data, ...second.body.data, ...third.body.data].map((s: { id: string }) => s.id);
    const unique = new Set(ids);

    expect(unique.size).toBe(7);
  });

  it('GET /v1/subjects/default/samples returns 400 for invalid cursor', async () => {
    const res = await request(server).get('/v1/subjects/default/samples').query({
      metric: 'heart_rate',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-02T00:00:00Z',
      cursor: 'not-a-cursor'
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_cursor');
  });

  it('GET /v1/subjects/default/workouts (list + by-id)', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source('Watch'));
    const wid = await upsertWorkout(knex, sourceId, {
      subjectId: 'default',
      activityType: 'running',
      startTime: new Date('2026-05-01T08:00:00Z'),
      endTime: new Date('2026-05-01T08:30:00Z'),
      durationSeconds: 1800,
      externalId: 'wk-1',
      metadata: { rawActivityType: 'HKWorkoutActivityTypeRunning' }
    });

    const list = await request(server)
      .get('/v1/subjects/default/workouts')
      .query({ from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z' });

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].activity_type).toBe('running');
    expect(list.body.data[0].duration_s).toBe(1800);

    const one = await request(server).get(`/v1/subjects/default/workouts/${wid}`);

    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe(wid.toString());
    expect((one.body.data.metadata as { rawActivityType: string }).rawActivityType).toBe(
      'HKWorkoutActivityTypeRunning'
    );

    const notFound = await request(server).get('/v1/subjects/default/workouts/99999');

    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('not_found');
  });

  it('GET /v1/subjects/default/sources?include_sample_count=true', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source('Phone'));

    await ingestCanonical(knex, [sampleAt(sourceId, 'step_count', '2026-05-01T10:00:00Z', 1000, 'a')]);

    const res = await request(server).get('/v1/subjects/default/sources').query({ include_sample_count: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].source_name).toBe('Phone');
    expect(res.body.data[0].sample_count).toBe(1);
  });

  it('GET /v1/subjects/default/summary returns totals + per-metric breakdown', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2026-05-01T10:00:00Z', 5000, 'a'),
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:00:00Z', 75, 'b', 'count/min')
    ]);

    const res = await request(server)
      .get('/v1/subjects/default/summary')
      .query({ from: '2026-05-01T00:00:00Z', to: '2026-05-02T00:00:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.data.totals.samples).toBeGreaterThanOrEqual(2);

    const metrics = res.body.data.per_metric as Array<{ metric: string; sample_count: number }>;

    expect(metrics.find(m => m.metric === 'step_count')?.sample_count).toBe(1);
    expect(metrics.find(m => m.metric === 'heart_rate')?.sample_count).toBe(1);
  });

  it('GET /v1/subjects/default/imports returns empty list when nothing imported', async () => {
    const res = await request(server).get('/v1/subjects/default/imports');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 404 on unknown routes', async () => {
    const res = await request(server).get('/v1/nope');

    expect(res.status).toBe(404);
  });
});
