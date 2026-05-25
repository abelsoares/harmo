// US-12 — DST + timezone correctness.
// On 2024-03-31, Europe/Lisbon springs forward from 01:00 → 02:00 local, skipping the 01:xx hour.
// The Lisbon-local "day" has 23 hours, but the underlying UTC instants are still continuous.
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
  await knex('source_priority').delete();
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

function sample(sourceId: bigint, isoTime: string, value: number, externalId: string): CanonicalSample {
  return {
    subjectId: 'default',
    metric: 'step_count',
    valueNum: value,
    valueText: null,
    unit: 'count',
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

describe('aggregate() — DST + timezone correctness', () => {
  beforeEach(resetData);

  it('Lisbon DST spring-forward day has 23 hours (24 UTC hours span the local day)', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    // Lisbon Mar 31, 2024: clocks jump 01:00 WET → 02:00 WEST. The 01:00 hour doesn't exist.
    // Lisbon Mar 31 in UTC = 2024-03-31T00:00:00Z to 2024-03-31T23:00:00Z (24 UTC hours covering 23 local hours).
    // We insert one sample per UTC hour within that window: 23 UTC hours (00..22) → 23 distinct
    // local hour buckets (00, 02, 03, …, 23 — note the missing 01).
    const samples: CanonicalSample[] = [];

    for (let h = 0; h < 23; h++) {
      const iso = `2024-03-31T${String(h).padStart(2, '0')}:30:00Z`;

      samples.push(sample(sourceId, iso, 100, `ext-${h}`));
    }

    await ingestCanonical(knex, samples);

    const lisbonRows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'hour',
      // Lisbon Mar 31 in UTC: 00:00Z → 23:00Z (Lisbon Apr 1 00:00 WEST starts at 23:00Z).
      from: new Date('2024-03-31T00:00:00Z'),
      to: new Date('2024-03-31T23:00:00Z'),
      timezone: 'Europe/Lisbon'
    });

    expect(lisbonRows.reduce((s, r) => s + r.value, 0)).toBe(2300);
    expect(lisbonRows.reduce((s, r) => s + r.sampleCount, 0)).toBe(23);
    expect(lisbonRows.length).toBe(23);
  });

  it('same samples produce different bucket boundaries in UTC vs Lisbon', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    // Summer (Lisbon = UTC+1): a UTC midnight sample falls on the previous day in Lisbon.
    await ingestCanonical(knex, [
      sample(sourceId, '2024-07-01T00:30:00Z', 100, 'a'),
      sample(sourceId, '2024-07-01T12:00:00Z', 200, 'b'),
      sample(sourceId, '2024-07-01T23:30:00Z', 300, 'c')
    ]);

    const utcRows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-06-30T00:00:00Z'),
      to: new Date('2024-07-03T00:00:00Z'),
      timezone: 'UTC'
    });

    expect(utcRows).toHaveLength(1);
    expect(utcRows[0].value).toBe(600);
    expect(utcRows[0].bucketStart.toISOString()).toBe('2024-07-01T00:00:00.000Z');

    const lisbonRows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-06-30T00:00:00Z'),
      to: new Date('2024-07-03T00:00:00Z'),
      timezone: 'Europe/Lisbon'
    });

    // In Lisbon (+0100 in summer), the 00:30Z and 12:00Z samples land on 2024-07-01 local;
    // the 23:30Z sample (which is 00:30 the next day local) lands on 2024-07-02 local.
    expect(lisbonRows).toHaveLength(2);
    expect(lisbonRows[0].value).toBe(300); // 00:30Z + 12:00Z on Lisbon day 2024-07-01
    expect(lisbonRows[1].value).toBe(300); // 23:30Z on Lisbon day 2024-07-02

    // Bucket boundaries in UTC differ from raw UTC midnight: Lisbon midnight = UTC 23:00 prev day.
    expect(lisbonRows[0].bucketStart.toISOString()).toBe('2024-06-30T23:00:00.000Z');
    expect(lisbonRows[1].bucketStart.toISOString()).toBe('2024-07-01T23:00:00.000Z');
  });

  it('fall-back DST day produces 25-hour day in Lisbon (autumn)', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    // 2024-10-27 in Lisbon: clocks fall back from 02:00 → 01:00 local. The local "day" has 25 hours.
    // 25 UTC samples span this Lisbon day → 24 distinct local hour buckets (the 01:00 local hour
    // is visited TWICE, but date_trunc('hour') treats them as the same bucket since the local
    // wallclock label is identical).
    const samples: CanonicalSample[] = [];

    for (let h = 0; h < 25; h++) {
      // 2024-10-26T23:30:00Z (= 00:30 Lisbon WEST) through 2024-10-27T23:30:00Z (= 23:30 Lisbon WET)
      const utcMs = Date.UTC(2024, 9, 26, 23, 30, 0) + h * 60 * 60 * 1000;

      samples.push(sample(sourceId, new Date(utcMs).toISOString(), 100, `ext-${h}`));
    }

    await ingestCanonical(knex, samples);

    const lisbonRows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'hour',
      from: new Date('2024-10-26T22:00:00Z'),
      to: new Date('2024-10-28T01:00:00Z'),
      timezone: 'Europe/Lisbon'
    });

    const totalValue = lisbonRows.reduce((sum, r) => sum + r.value, 0);
    const totalCount = lisbonRows.reduce((sum, c) => sum + c.sampleCount, 0);

    expect(totalValue).toBe(2500);
    expect(totalCount).toBe(25);
    // 25 distinct local-hour wall-clock labels collapse to 24 distinct bucket starts
    // because the 01:00 hour occurs twice during fall-back and date_trunc treats them
    // as the same bucket.
    expect(lisbonRows.length).toBe(24);
  });

  it('bucketStart is always a UTC instant pointing at the local midnight', async () => {
    const knex = getKnex();
    const sourceId = await upsertSource(knex, source());

    await ingestCanonical(knex, [sample(sourceId, '2024-07-15T15:00:00Z', 1, 'a')]);

    const rows = await aggregate(knex, {
      subjectId: 'default',
      metric: 'step_count',
      bucket: 'day',
      from: new Date('2024-07-15T00:00:00Z'),
      to: new Date('2024-07-16T00:00:00Z'),
      timezone: 'Europe/Lisbon'
    });

    // Lisbon midnight 2024-07-15 = UTC 2024-07-14 23:00:00.
    expect(rows[0].bucketStart.toISOString()).toBe('2024-07-14T23:00:00.000Z');
  });
});
