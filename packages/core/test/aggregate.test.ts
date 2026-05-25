import type { CanonicalSample, CanonicalSource } from '@harmo/common';
import { aggregate } from '@src/aggregate';
import { getKnex } from '@src/clients';
import { ingestCanonical } from '@src/ingest/canonical';
import { computeSourceIdentityHash, resetSourceCache, upsertSource } from '@src/ingest/source-cache';
import { beforeEach, describe, expect, it } from 'vitest';

async function resetData() {
  resetSourceCache();
  const knex = getKnex();

  await knex('samples').delete();
  await knex('sources').delete();
}

function source(name = 'TestSource'): CanonicalSource {
  return {
    subjectId: 'default',
    vendor: 'apple',
    sourceName: name,
    manufacturer: null,
    hardwareVersion: null,
    softwareVersion: null,
    productType: null,
    identityHash: computeSourceIdentityHash({ vendor: 'apple', sourceName: name })
  };
}

function sampleAt(
  sourceId: bigint,
  metric: string,
  isoTime: string,
  value: number,
  externalId: string,
  unit: string | null = null
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
    registryVersion: 1,
    metadata: {}
  };
}

describe('aggregate()', () => {
  beforeEach(resetData);

  it('sums step_count by day in UTC', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2024-12-30T09:00:00Z', 1000, 'a', 'count'),
      sampleAt(sourceId, 'step_count', '2024-12-30T15:00:00Z', 2000, 'b', 'count'),
      sampleAt(sourceId, 'step_count', '2024-12-31T10:00:00Z', 5000, 'c', 'count')
    ]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-12-30T00:00:00Z'),
      to: new Date('2025-01-01T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      bucketStart: new Date('2024-12-30T00:00:00Z'),
      value: 3000,
      sampleCount: 2
    });
    expect(rows[1]).toMatchObject({
      bucketStart: new Date('2024-12-31T00:00:00Z'),
      value: 5000,
      sampleCount: 1
    });
  });

  it('averages heart_rate by hour using the registry default agg', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'heart_rate', '2024-12-30T10:05:00Z', 60, 'a', 'count/min'),
      sampleAt(sourceId, 'heart_rate', '2024-12-30T10:30:00Z', 80, 'b', 'count/min'),
      sampleAt(sourceId, 'heart_rate', '2024-12-30T11:00:00Z', 100, 'c', 'count/min')
    ]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'heart_rate',
      bucket: 'hour',
      from: new Date('2024-12-30T00:00:00Z'),
      to: new Date('2024-12-31T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBeCloseTo(70, 6);
    expect(rows[0].sampleCount).toBe(2);
    expect(rows[1].value).toBeCloseTo(100, 6);
    expect(rows[1].sampleCount).toBe(1);
  });

  it('returns min/max correctly', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'heart_rate', '2024-12-30T10:05:00Z', 55, 'a'),
      sampleAt(sourceId, 'heart_rate', '2024-12-30T10:30:00Z', 120, 'b'),
      sampleAt(sourceId, 'heart_rate', '2024-12-30T11:00:00Z', 80, 'c')
    ]);

    const mins = await aggregate(knex, {
      subjectId: 'default',
      metric: 'heart_rate',
      bucket: 'day',
      from: new Date('2024-12-30T00:00:00Z'),
      to: new Date('2024-12-31T00:00:00Z'),
      timezone: 'UTC',
      agg: 'min'
    });

    expect(mins[0].value).toBe(55);

    const maxes = await aggregate(knex, {
      subjectId: 'default',
      metric: 'heart_rate',
      bucket: 'day',
      from: new Date('2024-12-30T00:00:00Z'),
      to: new Date('2024-12-31T00:00:00Z'),
      timezone: 'UTC',
      agg: 'max'
    });

    expect(maxes[0].value).toBe(120);
  });

  it('returns the latest value per bucket for body_mass', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'body_mass', '2024-12-30T08:00:00Z', 87, 'a', 'kg'),
      sampleAt(sourceId, 'body_mass', '2024-12-30T18:00:00Z', 85, 'b', 'kg'),
      sampleAt(sourceId, 'body_mass', '2024-12-31T08:00:00Z', 86, 'c', 'kg')
    ]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'body_mass',
      bucket: 'day',
      from: new Date('2024-12-30T00:00:00Z'),
      to: new Date('2025-01-01T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(85);
    expect(rows[0].sampleCount).toBe(2);
    expect(rows[1].value).toBe(86);
    expect(rows[1].sampleCount).toBe(1);
  });

  it('falls back to subjects.timezone when none is provided', async () => {
    // Lisbon is UTC+1 in summer (WEST). 2024-06-30T23:30:00Z is already 2024-07-01 in Lisbon.
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2024-06-30T23:30:00Z', 100, 'a', 'count'),
      sampleAt(sourceId, 'step_count', '2024-07-01T01:30:00Z', 200, 'b', 'count')
    ]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-06-30T00:00:00Z'),
      to: new Date('2024-07-02T00:00:00Z')
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(300);
    // Lisbon midnight 2024-07-01 = UTC 2024-06-30 23:00:00.
    expect(rows[0].bucketStart.toISOString()).toBe('2024-06-30T23:00:00.000Z');
  });

  it('respects the explicit timezone parameter', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sampleAt(sourceId, 'step_count', '2024-06-30T23:30:00Z', 100, 'a', 'count'),
      sampleAt(sourceId, 'step_count', '2024-07-01T01:30:00Z', 200, 'b', 'count')
    ]);

    // In UTC, the two samples fall on different days → 2 buckets.
    const utcRows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-06-30T00:00:00Z'),
      to: new Date('2024-07-02T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(utcRows).toHaveLength(2);
    expect(utcRows[0].value).toBe(100);
    expect(utcRows[1].value).toBe(200);
  });

  it('returns empty array when no samples are in range', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [sampleAt(sourceId, 'step_count', '2024-12-30T10:00:00Z', 100, 'a', 'count')]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2025-01-01T00:00:00Z'),
      to: new Date('2025-02-01T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(rows).toEqual([]);
  });

  it('throws on unknown metric', async () => {
    const knex = getKnex();

    await expect(
      aggregate(knex, {
        subjectId: 'default',
        metric: 'made_up_metric',
        bucket: 'day',
        from: new Date('2024-01-01T00:00:00Z'),
        to: new Date('2024-02-01T00:00:00Z')
      })
    ).rejects.toThrow(/unknown metric: made_up_metric/);
  });

  it('throws when agg is not in allowed_aggs', async () => {
    const knex = getKnex();

    // step_count only allows 'sum', not 'avg'.
    await expect(
      aggregate(knex, {
        subjectId: 'default',
        metric: 'step_count',
        bucket: 'day',
        agg: 'avg',
        from: new Date('2024-01-01T00:00:00Z'),
        to: new Date('2024-02-01T00:00:00Z')
      })
    ).rejects.toThrow(/agg 'avg' not allowed for metric 'step_count'/);
  });

  it('throws on category metrics (sleep_analysis)', async () => {
    const knex = getKnex();

    await expect(
      aggregate(knex, {
        subjectId: 'default',
        metric: 'sleep_analysis',
        bucket: 'day',
        from: new Date('2024-01-01T00:00:00Z'),
        to: new Date('2024-02-01T00:00:00Z')
      })
    ).rejects.toThrow(/supports quantity metrics only/);
  });
});
