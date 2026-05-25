import type { CanonicalSample, CanonicalSource } from '@harmo/common';
import { getKnex } from '@src/clients';
import { ingestCanonical } from '@src/ingest/canonical';
import { computeSourceIdentityHash, resetSourceCache, upsertSource } from '@src/ingest/source-cache';
import { beforeEach, describe, expect, it } from 'vitest';

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

function sample(overrides: Partial<CanonicalSample> & { sourceId: bigint; externalId: string }): CanonicalSample {
  return {
    subjectId: 'default',
    metric: 'heart_rate',
    valueNum: 72,
    valueText: null,
    unit: 'count/min',
    startTime: new Date('2024-12-30T18:06:57Z'),
    endTime: new Date('2024-12-30T18:07:54Z'),
    startOffsetMinutes: 60,
    workoutId: null,
    correlationId: null,
    registryVersion: 1,
    metadata: {},
    ...overrides
  };
}

describe('ingestCanonical', () => {
  beforeEach(async () => {
    resetSourceCache();
    const knex = getKnex();

    await knex('samples').delete();
    await knex('workouts').delete();
    await knex('correlations').delete();
    await knex('sources').delete();
  });

  it('is a no-op for an empty batch', async () => {
    const knex = getKnex();
    const result = await ingestCanonical(knex, []);

    expect(result).toEqual({ processed: 0 });
  });

  it('inserts a single sample', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    const result = await ingestCanonical(knex, [sample({ sourceId, externalId: 'ext-1' })]);

    expect(result.processed).toBe(1);

    const count = await knex('samples').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(1);
  });

  it('upserts on conflict without growing the table; later value wins', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [sample({ sourceId, externalId: 'ext-1', valueNum: 70 })]);
    await ingestCanonical(knex, [sample({ sourceId, externalId: 'ext-1', valueNum: 80 })]);

    const row = await knex('samples').first<{ value_num: number }>('value_num');

    expect(row?.value_num).toBe(80);

    const count = await knex('samples').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(1);
  });

  it('inserts a batch of distinct samples', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());
    const batch = Array.from({ length: 10 }, (_, i) =>
      sample({
        sourceId,
        externalId: `ext-${i}`,
        startTime: new Date(`2024-12-30T18:${String(i).padStart(2, '0')}:00Z`),
        endTime: new Date(`2024-12-30T18:${String(i).padStart(2, '0')}:00Z`),
        valueNum: 60 + i
      })
    );

    const result = await ingestCanonical(knex, batch);

    expect(result.processed).toBe(10);

    const count = await knex('samples').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(10);
  });

  it('handles mixed new + existing rows on re-ingest', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sample({ sourceId, externalId: 'ext-A', valueNum: 1 }),
      sample({ sourceId, externalId: 'ext-B', valueNum: 2 })
    ]);

    await ingestCanonical(knex, [
      sample({ sourceId, externalId: 'ext-A', valueNum: 11 }),
      sample({ sourceId, externalId: 'ext-C', valueNum: 3 })
    ]);

    const count = await knex('samples').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count)).toBe(3);

    const a = await knex('samples').where({ external_id: 'ext-A' }).first<{ value_num: number }>('value_num');

    expect(a?.value_num).toBe(11);
  });

  it('routes samples to correct monthly partitions', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sample({
        sourceId,
        externalId: 'jan',
        startTime: new Date('2024-01-15T12:00:00Z'),
        endTime: new Date('2024-01-15T12:00:00Z')
      }),
      sample({
        sourceId,
        externalId: 'feb',
        startTime: new Date('2024-02-15T12:00:00Z'),
        endTime: new Date('2024-02-15T12:00:00Z')
      })
    ]);

    const jan = await knex
      .raw<{ rows: Array<{ count: string }> }>('SELECT count(*)::int AS count FROM samples_2024_01')
      .then(r => r.rows[0]);
    const feb = await knex
      .raw<{ rows: Array<{ count: string }> }>('SELECT count(*)::int AS count FROM samples_2024_02')
      .then(r => r.rows[0]);

    expect(Number(jan.count)).toBe(1);
    expect(Number(feb.count)).toBe(1);
  });

  it('preserves null workout_id / correlation_id and JSON metadata', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [
      sample({
        sourceId,
        externalId: 'ext-null',
        metadata: { foo: 'bar', n: 42 }
      })
    ]);

    const row = await knex('samples').first<{
      workout_id: string | null;
      correlation_id: string | null;
      metadata: Record<string, unknown>;
    }>('workout_id', 'correlation_id', 'metadata');

    expect(row?.workout_id).toBeNull();
    expect(row?.correlation_id).toBeNull();
    expect(row?.metadata).toEqual({ foo: 'bar', n: 42 });
  });
});
