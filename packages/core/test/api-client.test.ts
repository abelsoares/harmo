import type { AddressInfo } from 'node:net';
import { buildApp } from '@apps/api/index';
import { HarmoApiError, HarmoClient } from '@harmo/api-client';
import type { CanonicalSample, CanonicalSource } from '@harmo/common';
import { INGEST_QUEUE } from '@harmo/common';
import { getKnex } from '@src/clients';
import { ingestCanonical } from '@src/ingest/canonical';
import { computeSourceIdentityHash, resetSourceCache, upsertSource } from '@src/ingest/source-cache';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { purgeQueue } from './helpers/pgmq';

let server: ReturnType<ReturnType<typeof buildApp>['listen']>;
let client: HarmoClient;

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
  unit = 'count/min'
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

beforeAll(async () => {
  const app = buildApp();

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;

  client = new HarmoClient({ baseUrl: `http://127.0.0.1:${port}` });
});

afterAll(() => {
  server.close();
});

describe('@harmo/api-client', () => {
  beforeEach(resetState);

  it('client.health() returns the canonical health payload', async () => {
    const res = await client.health();

    expect(res.data.status).toBe('ok');
    expect(res.data.registry_version).toBeGreaterThan(0);
  });

  it('client.metrics() returns the registry', async () => {
    const res = await client.metrics();

    expect(res.data.length).toBeGreaterThan(10);
    expect(res.data.some(m => m.metric === 'heart_rate')).toBe(true);
  });

  it('client.aggregate() returns daily sums', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2026-05-01T10:00:00Z', 5000, 'a', 'count'),
      sampleAt(sourceId, 'step_count', '2026-05-02T10:00:00Z', 7000, 'b', 'count')
    ]);

    const res = await client.aggregate({
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-03T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(res.data).toHaveLength(2);
    expect(res.data[0].value).toBe(5000);
    expect(res.data[1].value).toBe(7000);
  });

  it('client.aggregate() throws HarmoApiError on unknown metric', async () => {
    await expect(
      client.aggregate({
        subjectId: 'default',
        metric: 'made_up',
        bucket: 'day',
        from: new Date('2026-05-01T00:00:00Z'),
        to: new Date('2026-05-02T00:00:00Z')
      })
    ).rejects.toThrow(HarmoApiError);
  });

  it('client.streamSamples() iterates all rows across cursor boundaries', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    // 25 samples; with limit=10 the client should walk 3 pages.
    const samples = Array.from({ length: 25 }, (_, i) => {
      const iso = `2026-05-01T10:${String(i).padStart(2, '0')}:00Z`;

      return sampleAt(sourceId, 'heart_rate', iso, 60 + i, `ext-${i}`);
    });

    await ingestCanonical(knex, samples);

    const collected: string[] = [];

    for await (const s of client.streamSamples({
      subjectId: 'default',
      metric: 'heart_rate',
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-02T00:00:00Z'),
      limit: 10
    })) {
      collected.push(s.id);
    }

    expect(collected).toHaveLength(25);
    expect(new Set(collected).size).toBe(25); // no duplicates
  });

  it('client.allSamples() collects every row into memory', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:00:00Z', 70, 'a'),
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:01:00Z', 71, 'b'),
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:02:00Z', 72, 'c')
    ]);

    const rows = await client.allSamples({
      subjectId: 'default',
      metric: 'heart_rate',
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-02T00:00:00Z'),
      limit: 2
    });

    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.value_num)).toEqual([70, 71, 72]);
  });

  it('client.sources({ includeSampleCount: true }) returns counts', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source('Phone'));

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:00:00Z', 70, 'a'),
      sampleAt(sourceId, 'heart_rate', '2026-05-01T10:01:00Z', 71, 'b')
    ]);

    const res = await client.sources({ subjectId: 'default', includeSampleCount: true });

    expect(res.data).toHaveLength(1);
    expect(res.data[0].sample_count).toBe(2);
  });

  it('client.summary() returns the overview shape', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [sampleAt(sourceId, 'heart_rate', '2026-05-01T10:00:00Z', 70, 'a')]);

    const res = await client.summary({ subjectId: 'default' });

    expect(res.data.totals.samples).toBe(1);
    expect(res.data.per_metric.find(m => m.metric === 'heart_rate')?.sample_count).toBe(1);
  });

  it('HarmoApiError exposes status + code + details', async () => {
    try {
      await client.workout('default', '99999');
      expect.fail('expected HarmoApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(HarmoApiError);
      const apiErr = err as HarmoApiError;

      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('not_found');
    }
  });
});
