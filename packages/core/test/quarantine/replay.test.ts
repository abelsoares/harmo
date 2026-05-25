import type { RawEnvelope } from '@harmo/common';
import { INGEST_QUEUE } from '@harmo/common';
import { getKnex } from '@src/clients';
import { resetSourceCache } from '@src/ingest/source-cache';
import { runReplayQuarantine } from '@src/quarantine/replay';
import { storeQuarantine } from '@src/quarantine/store';
import { resetRegistryCache } from '@src/registry/lookup';
import { beforeEach, describe, expect, it } from 'vitest';
import { peekMessages, purgeQueue, queueLength } from '../helpers/pgmq';

async function resetState() {
  resetSourceCache();
  resetRegistryCache();
  const knex = getKnex();

  await knex('samples').delete();
  await knex('correlations').delete();
  await knex('workouts').delete();
  await knex('quarantine').delete();
  await knex('sources').delete();
  await purgeQueue(knex, INGEST_QUEUE);

  // Remove any test-only metric_aliases / metrics_registry rows added by previous tests.
  await knex('metric_aliases').where('alias', 'like', 'HKQuantityTypeIdentifierTest%').delete();
  await knex('metrics_registry').where('metric', 'like', 'test_%').delete();
}

function recordEnvelope(attrs: Record<string, string>, metadata: Record<string, string> = {}): RawEnvelope {
  return {
    vendor: 'apple',
    batchId: 'orig-batch',
    payload: { kind: 'Record', attrs, metadata, children: [] }
  };
}

describe('runReplayQuarantine', () => {
  beforeEach(resetState);

  it('replays an unknown_alias row into samples once the alias is registered', async () => {
    const knex = getKnex();
    const envelope = recordEnvelope({
      type: 'HKQuantityTypeIdentifierTestMetric',
      sourceName: 'TestSource',
      unit: 'count/min',
      startDate: '2024-12-30 10:00:00 +0000',
      endDate: '2024-12-30 10:00:00 +0000',
      value: '70'
    });

    await storeQuarantine(knex, {
      subjectId: 'default',
      vendor: 'apple',
      reason: 'unknown_alias',
      raw: envelope,
      context: { alias: 'HKQuantityTypeIdentifierTestMetric' }
    });

    // Register the missing alias (test-scope; bypasses the registry migration).
    await knex('metrics_registry').insert({
      metric: 'test_metric',
      value_kind: 'quantity',
      temporal_kind: 'instant',
      canonical_unit: 'count/min',
      default_agg: 'avg',
      allowed_aggs: ['avg'],
      resolve_overlap: false,
      registry_version: 1
    });
    await knex('metric_aliases').insert({
      vendor: 'apple',
      alias: 'HKQuantityTypeIdentifierTestMetric',
      metric: 'test_metric'
    });

    const result = await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: true });

    expect(result.scanned).toBe(1);
    expect(result.replayed).toBe(1);

    const samples = await knex('samples').count<{ count: string }>({ count: '*' }).first();
    const quarantine = await knex('quarantine').count<{ count: string }>({ count: '*' }).first();

    expect(Number(samples?.count)).toBe(1);
    expect(Number(quarantine?.count)).toBe(0);
  });

  it('dry-run reports counts and does not change state', async () => {
    const knex = getKnex();

    for (let i = 0; i < 3; i++) {
      await storeQuarantine(knex, {
        subjectId: 'default',
        vendor: 'apple',
        reason: 'unknown_alias',
        raw: recordEnvelope({
          type: 'HKQuantityTypeIdentifierTestUnknown',
          sourceName: 'TestSource',
          unit: 'count',
          startDate: `2024-12-30 10:0${i}:00 +0000`,
          endDate: `2024-12-30 10:0${i}:00 +0000`,
          value: '1'
        }),
        context: {}
      });
    }

    const result = await runReplayQuarantine(knex, { dryRun: true });

    expect(result.remainingByReason).toEqual({ unknown_alias: 3 });
    expect(result.scanned).toBe(0);
    expect(result.replayed).toBe(0);

    const after = await knex('quarantine').count<{ count: string }>({ count: '*' }).first();

    expect(Number(after?.count)).toBe(3);
  });

  it('filters by reason — untouched rows stay', async () => {
    const knex = getKnex();

    for (let i = 0; i < 2; i++) {
      await storeQuarantine(knex, {
        subjectId: 'default',
        vendor: 'apple',
        reason: 'unknown_alias',
        raw: recordEnvelope({
          type: 'HKQuantityTypeIdentifierTestUnknown',
          sourceName: 'X',
          unit: 'count',
          startDate: `2024-12-30 10:0${i}:00 +0000`,
          endDate: `2024-12-30 10:0${i}:00 +0000`,
          value: '1'
        }),
        context: {}
      });
    }

    await storeQuarantine(knex, {
      subjectId: 'default',
      vendor: 'apple',
      reason: 'pre_aggregated',
      raw: {
        vendor: 'apple',
        batchId: 'b',
        payload: { kind: 'ActivitySummary', attrs: {}, metadata: {}, children: [] }
      },
      context: {}
    });

    const result = await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: true });

    expect(result.scanned).toBe(2);
    expect(result.replayed).toBe(2);

    const reasons = await knex('quarantine')
      .groupBy('reason')
      .select<Array<{ reason: string; n: string }>>('reason')
      .count('* as n');
    const reasonCounts = Object.fromEntries(reasons.map(r => [r.reason, Number(r.n)]));

    // unknown_alias re-quarantined (since alias still missing); pre_aggregated untouched.
    expect(reasonCounts).toEqual({ unknown_alias: 2, pre_aggregated: 1 });
  });

  it('re-quarantine path: original row is deleted, exactly one new row written', async () => {
    const knex = getKnex();
    await storeQuarantine(knex, {
      subjectId: 'default',
      vendor: 'apple',
      reason: 'unknown_alias',
      raw: recordEnvelope({
        type: 'HKQuantityTypeIdentifierStillMissing',
        sourceName: 'X',
        unit: 'count',
        startDate: '2024-12-30 10:00:00 +0000',
        endDate: '2024-12-30 10:00:00 +0000',
        value: '1'
      }),
      context: {}
    });

    const originalIds = await knex('quarantine').pluck('id');

    expect(originalIds).toHaveLength(1);

    await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: true });

    const afterIds = await knex('quarantine').pluck('id');

    expect(afterIds).toHaveLength(1);
    expect(afterIds[0]).not.toBe(originalIds[0]); // fresh row, fresh id
  });

  it('--limit caps the rows processed in one call', async () => {
    const knex = getKnex();

    for (let i = 0; i < 5; i++) {
      await storeQuarantine(knex, {
        subjectId: 'default',
        vendor: 'apple',
        reason: 'unknown_alias',
        raw: recordEnvelope({
          type: 'HKQuantityTypeIdentifierTestLimit',
          sourceName: 'X',
          unit: 'count',
          startDate: `2024-12-30 10:0${i}:00 +0000`,
          endDate: `2024-12-30 10:0${i}:00 +0000`,
          value: '1'
        }),
        context: {}
      });
    }

    const result = await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: true, limit: 2 });

    expect(result.scanned).toBe(2);
    expect(result.replayed).toBe(2);

    // 2 oldest got deleted + re-quarantined → 2 fresh entries with new ids.
    // 3 unprocessed rows stay with their original ids.
    // Total: 5 rows (3 original + 2 new).
    const remaining = await knex('quarantine').count<{ count: string }>({ count: '*' }).first();

    expect(Number(remaining?.count)).toBe(5);
  });

  it('pgmq mode (no --inline) enqueues to ingest_q and deletes the source rows', async () => {
    const knex = getKnex();
    await storeQuarantine(knex, {
      subjectId: 'default',
      vendor: 'apple',
      reason: 'unknown_alias',
      raw: recordEnvelope({
        type: 'HKQuantityTypeIdentifierTestPgmq',
        sourceName: 'X',
        unit: 'count',
        startDate: '2024-12-30 10:00:00 +0000',
        endDate: '2024-12-30 10:00:00 +0000',
        value: '1'
      }),
      context: {}
    });
    await storeQuarantine(knex, {
      subjectId: 'default',
      vendor: 'apple',
      reason: 'unknown_alias',
      raw: recordEnvelope({
        type: 'HKQuantityTypeIdentifierTestPgmq',
        sourceName: 'X',
        unit: 'count',
        startDate: '2024-12-30 10:01:00 +0000',
        endDate: '2024-12-30 10:01:00 +0000',
        value: '2'
      }),
      context: {}
    });

    const result = await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: false });

    expect(result.scanned).toBe(2);
    expect(result.replayed).toBe(2);

    expect(await queueLength(knex, INGEST_QUEUE)).toBe(2);

    const messages = await peekMessages<{ vendor: string; payload: { attrs: { type: string } } }>(
      knex,
      INGEST_QUEUE,
      5
    );

    expect(messages.map(m => m.message.payload.attrs.type)).toEqual([
      'HKQuantityTypeIdentifierTestPgmq',
      'HKQuantityTypeIdentifierTestPgmq'
    ]);

    const quarantine = await knex('quarantine').count<{ count: string }>({ count: '*' }).first();

    expect(Number(quarantine?.count)).toBe(0);
  });

  it('skips rows whose raw payload fails Zod validation (leaves them in place)', async () => {
    const knex = getKnex();
    // Insert a row with a malformed raw envelope (missing payload).
    await knex('quarantine').insert({
      subject_id: 'default',
      vendor: 'apple',
      reason: 'unknown_alias',
      raw: JSON.stringify({ vendor: 'apple', batchId: 'b' }),
      context: '{}'
    });

    const result = await runReplayQuarantine(knex, { reason: 'unknown_alias', inline: true });

    expect(result.scanned).toBe(1);
    expect(result.replayed).toBe(0);
    expect(result.skipped).toBe(1);

    const remaining = await knex('quarantine').count<{ count: string }>({ count: '*' }).first();

    expect(Number(remaining?.count)).toBe(1); // bad row stays
  });
});
