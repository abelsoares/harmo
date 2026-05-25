import type { RawEnvelope } from '@harmo/common';
import { getKnex } from '@src/clients';
import { normalizeAppleCorrelation } from '@src/normalize/apple/correlation';
import { describe, expect, it } from 'vitest';

function appleCorrelationEnvelope(attrs: Record<string, string>, metadata: Record<string, string> = {}): RawEnvelope {
  return {
    vendor: 'apple',
    batchId: 'test-batch',
    payload: { kind: 'Correlation', attrs, metadata, children: [] }
  };
}

describe('normalizeAppleCorrelation', () => {
  it('normalizes a blood-pressure Correlation into a canonical wrapper', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(
      knex,
      appleCorrelationEnvelope(
        {
          type: 'HKCorrelationTypeIdentifierBloodPressure',
          sourceName: 'Health',
          sourceVersion: '18.2',
          creationDate: '2025-01-03 08:30:55 +0100',
          startDate: '2025-01-03 08:30:00 +0100',
          endDate: '2025-01-03 08:30:00 +0100'
        },
        { HKWasUserEntered: '1' }
      )
    );

    expect(result.kind).toBe('correlation');

    if (result.kind !== 'correlation') {
      throw new Error('expected correlation');
    }

    expect(result.correlation.metric).toBe('blood_pressure');
    expect(result.correlation.startTime.toISOString()).toBe('2025-01-03T07:30:00.000Z');
    expect(result.correlation.endTime.toISOString()).toBe('2025-01-03T07:30:00.000Z');
    expect(result.correlation.metadata).toMatchObject({
      HKWasUserEntered: '1',
      rawType: 'HKCorrelationTypeIdentifierBloodPressure',
      startOffsetMinutes: 60
    });
    expect(result.correlation.externalId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.source.vendor).toBe('apple');
    expect(result.source.sourceName).toBe('Health');
    expect(result.source.softwareVersion).toBe('18.2');
  });

  it('uses HKExternalUUID from metadata as external_id for food correlations', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(
      knex,
      appleCorrelationEnvelope(
        {
          type: 'HKCorrelationTypeIdentifierFood',
          sourceName: 'Lose It!',
          sourceVersion: '1474',
          creationDate: '2025-01-09 21:39:03 +0100',
          startDate: '2025-01-09 13:00:00 +0100',
          endDate: '2025-01-09 13:00:00 +0100'
        },
        {
          HKExternalUUID: 'd259bd07-6164-4479-be19-e7adef9240bd',
          HKFoodMeal: 'Lunch',
          HKFoodType: 'Pizza, Pepperoni, Slice'
        }
      )
    );

    if (result.kind !== 'correlation') {
      throw new Error('expected correlation');
    }

    expect(result.correlation.metric).toBe('food');
    expect(result.correlation.externalId).toBe('d259bd07-6164-4479-be19-e7adef9240bd');
    expect(result.correlation.metadata.HKFoodMeal).toBe('Lunch');
  });

  it('synthesizes a deterministic external_id when no metadata id is present', async () => {
    const knex = getKnex();
    const env = appleCorrelationEnvelope({
      type: 'HKCorrelationTypeIdentifierBloodPressure',
      sourceName: 'Health',
      startDate: '2025-01-03 08:30:00 +0100',
      endDate: '2025-01-03 08:30:00 +0100'
    });

    const a = await normalizeAppleCorrelation(knex, env);
    const b = await normalizeAppleCorrelation(knex, env);

    if (a.kind !== 'correlation' || b.kind !== 'correlation') {
      throw new Error('expected correlations');
    }

    expect(a.correlation.externalId).toBe(b.correlation.externalId);
    expect(a.correlation.externalId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('falls back to snake_case for unknown correlation types', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(
      knex,
      appleCorrelationEnvelope({
        type: 'HKCorrelationTypeIdentifierFancyNewBundle',
        sourceName: 'Test',
        startDate: '2025-01-01 00:00:00 +0000',
        endDate: '2025-01-01 00:00:00 +0000'
      })
    );

    if (result.kind !== 'correlation') {
      throw new Error('expected correlation');
    }

    expect(result.correlation.metric).toBe('fancy_new_bundle');
    expect(result.correlation.metadata.rawType).toBe('HKCorrelationTypeIdentifierFancyNewBundle');
  });

  it('quarantines envelopes that arrive at the wrong handler', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(knex, {
      vendor: 'apple',
      batchId: 't',
      payload: { kind: 'Workout', attrs: {}, metadata: {}, children: [] }
    });

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('wrong_handler');
    }
  });

  it('quarantines correlations missing the type attribute', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(
      knex,
      appleCorrelationEnvelope({
        sourceName: 'Health',
        startDate: '2025-01-01 00:00:00 +0000',
        endDate: '2025-01-01 00:00:00 +0000'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('missing_type');
    }
  });

  it('quarantines correlations with malformed timestamps', async () => {
    const knex = getKnex();
    const result = await normalizeAppleCorrelation(
      knex,
      appleCorrelationEnvelope({
        type: 'HKCorrelationTypeIdentifierBloodPressure',
        sourceName: 'Health',
        startDate: 'not-a-date',
        endDate: '2025-01-01 00:00:00 +0000'
      })
    );

    expect(result.kind).toBe('quarantine');
    if (result.kind === 'quarantine') {
      expect(result.reason).toBe('invalid_timestamp');
    }
  });
});
