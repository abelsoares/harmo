import type { RawEnvelope } from '@harmo/common';
import { getKnex } from '@src/clients';
import { normalizeAppleRecord } from '@src/normalize/apple/record';
import { describe, expect, it } from 'vitest';

function appleEnvelope(attrs: Record<string, string>, metadata: Record<string, string> = {}): RawEnvelope {
  return {
    vendor: 'apple',
    batchId: 'test-batch',
    payload: {
      kind: 'Record',
      attrs,
      metadata,
      children: []
    }
  };
}

describe('normalizeAppleRecord', () => {
  it('normalizes a heart-rate Record into a canonical sample', async () => {
    const knex = getKnex();

    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierHeartRate',
        sourceName: "Abel's Apple Watch",
        sourceVersion: '11.1',
        unit: 'count/min',
        startDate: '2024-12-30 18:06:57 +0100',
        endDate: '2024-12-30 18:07:54 +0100',
        value: '72'
      })
    );

    expect(result.kind).toBe('sample');

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.metric).toBe('heart_rate');
    expect(result.sample.valueNum).toBe(72);
    expect(result.sample.valueText).toBeNull();
    expect(result.sample.unit).toBe('count/min');
    expect(result.sample.startTime.toISOString()).toBe('2024-12-30T17:06:57.000Z');
    expect(result.sample.startOffsetMinutes).toBe(60);
    expect(result.sample.registryVersion).toBe(1);
    expect(result.source.vendor).toBe('apple');
    expect(result.source.sourceName).toBe("Abel's Apple Watch");
    expect(result.source.softwareVersion).toBe('11.1');
    expect(result.source.identityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('converts mi → km for distance Records', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Strava',
        unit: 'mi',
        startDate: '2024-06-01 09:00:00 +0100',
        endDate: '2024-06-01 09:30:00 +0100',
        value: '1'
      })
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.metric).toBe('distance_walking_running');
    expect(result.sample.unit).toBe('km');
    expect(result.sample.valueNum).toBeCloseTo(1.609344, 6);
  });

  it('converts lb → kg for body mass', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierBodyMass',
        sourceName: 'Withings',
        unit: 'lb',
        startDate: '2025-01-02 14:01:38 +0100',
        endDate: '2025-01-02 14:01:38 +0100',
        value: '200'
      })
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.metric).toBe('body_mass');
    expect(result.sample.unit).toBe('kg');
    expect(result.sample.valueNum).toBeCloseTo(90.7185, 4);
  });

  it('normalizes a sleep category Record into value_text', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKCategoryTypeIdentifierSleepAnalysis',
        sourceName: "Abel's Apple Watch",
        startDate: '2024-12-30 23:00:00 +0100',
        endDate: '2024-12-31 07:00:00 +0100',
        value: 'HKCategoryValueSleepAnalysisAsleepCore'
      })
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.metric).toBe('sleep_analysis');
    expect(result.sample.valueNum).toBeNull();
    expect(result.sample.valueText).toBe('HKCategoryValueSleepAnalysisAsleepCore');
    expect(result.sample.unit).toBeNull();
  });

  it('uses HKExternalUUID from metadata as external_id', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope(
        {
          type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
          sourceName: 'Strava',
          unit: 'kcal',
          startDate: '2024-12-28 08:40:14 +0100',
          endDate: '2024-12-28 09:10:39 +0100',
          value: '528.152'
        },
        { HKExternalUUID: 'strava://activities/13205603309' }
      )
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.externalId).toBe('strava://activities/13205603309');
  });

  it('falls back to HKMetadataKeySyncIdentifier when no HKExternalUUID', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope(
        {
          type: 'HKQuantityTypeIdentifierBodyMass',
          sourceName: 'Withings',
          unit: 'kg',
          startDate: '2025-01-02 14:01:38 +0100',
          endDate: '2025-01-02 14:01:38 +0100',
          value: '87'
        },
        { HKMetadataKeySyncIdentifier: '6158960421' }
      )
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.sample.externalId).toBe('6158960421');
  });

  it('synthesizes a deterministic external_id when no metadata id is present', async () => {
    const knex = getKnex();
    const env = appleEnvelope({
      type: 'HKQuantityTypeIdentifierHeartRate',
      sourceName: "Abel's Apple Watch",
      unit: 'count/min',
      startDate: '2024-12-30 18:06:57 +0100',
      endDate: '2024-12-30 18:07:54 +0100',
      value: '72'
    });

    const a = await normalizeAppleRecord(knex, env);
    const b = await normalizeAppleRecord(knex, env);

    if (a.kind !== 'sample' || b.kind !== 'sample') {
      throw new Error('expected samples');
    }

    expect(a.sample.externalId).toBe(b.sample.externalId);
    expect(a.sample.externalId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('parses the device attribute into source provenance', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierHeartRate',
        sourceName: "Abel's Apple Watch",
        sourceVersion: '11.1',
        unit: 'count/min',
        device:
          '<<HKDevice: 0x7760935a0>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch7,9, software:11.1, creation date:2024-11-05 01:52:07 +0000>',
        startDate: '2024-12-30 18:06:57 +0100',
        endDate: '2024-12-30 18:07:54 +0100',
        value: '72'
      })
    );

    if (result.kind !== 'sample') {
      throw new Error('expected sample');
    }

    expect(result.source.manufacturer).toBe('Apple Inc.');
    expect(result.source.hardwareVersion).toBe('Watch7,9');
    expect(result.source.productType).toBe('Watch');
  });

  it('quarantines records with an unknown alias', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierDietaryPotassium',
        sourceName: 'Lose It!',
        unit: 'mg',
        startDate: '2025-01-09 13:00:00 +0100',
        endDate: '2025-01-09 13:00:00 +0100',
        value: '500'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('unknown_alias');
      expect(result.context).toMatchObject({ alias: 'HKQuantityTypeIdentifierDietaryPotassium' });
    }
  });

  it('quarantines records with an unknown unit', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierBodyMass',
        sourceName: 'Withings',
        unit: 'stones',
        startDate: '2025-01-02 14:01:38 +0100',
        endDate: '2025-01-02 14:01:38 +0100',
        value: '14'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('unit_unknown');
      expect(result.context).toMatchObject({ fromUnit: 'stones', toUnit: 'kg' });
    }
  });

  it('quarantines records with missing value on quantity metrics', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(
      knex,
      appleEnvelope({
        type: 'HKQuantityTypeIdentifierHeartRate',
        sourceName: "Abel's Apple Watch",
        unit: 'count/min',
        startDate: '2024-12-30 18:06:57 +0100',
        endDate: '2024-12-30 18:07:54 +0100'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('missing_value');
    }
  });

  it('quarantines envelopes that arrive at the wrong handler', async () => {
    const knex = getKnex();
    const result = await normalizeAppleRecord(knex, {
      vendor: 'apple',
      batchId: 'test',
      payload: { kind: 'Workout', attrs: {}, metadata: {}, children: [] }
    });

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('wrong_handler');
    }
  });
});
