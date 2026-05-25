import { join } from 'node:path';
import { runImport } from '@apps/importer/index';
import { pollOnce } from '@apps/worker/index';
import { INGEST_QUEUE } from '@harmo/common';
import { getKnex } from '@src/clients';
import { resetSourceCache } from '@src/ingest/source-cache';
import { processMessage } from '@src/worker/process-message';
import { beforeEach, describe, expect, it } from 'vitest';
import { purgeQueue, queueLength } from './helpers/pgmq';

const FIXTURES_DIR = join(__dirname, 'fixtures/apple');

async function resetState() {
  resetSourceCache();
  const knex = getKnex();

  await knex('samples').delete();
  await knex('correlations').delete();
  await knex('workouts').delete();
  await knex('quarantine').delete();
  await knex('sources').delete();
  await knex('import_runs').delete();
  await purgeQueue(knex, INGEST_QUEUE);
}

async function drainQueue(): Promise<number> {
  let total = 0;
  let drained = 0;

  do {
    drained = await pollOnce();
    total += drained;
  } while (drained > 0);

  return total;
}

describe('worker — end-to-end', () => {
  beforeEach(resetState);

  it('processes a BP-correlation import all the way into samples + correlations + sources', async () => {
    await runImport({ filePath: join(FIXTURES_DIR, 'bp-correlation.xml') });

    const before = await queueLength(getKnex(), INGEST_QUEUE);

    expect(before).toBe(3);

    await drainQueue();

    const knex = getKnex();
    const counts = await knex
      .raw<{ rows: Array<{ samples: string; correlations: string; sources: string; quarantine: string }> }>(
        `SELECT
           (SELECT count(*) FROM samples) AS samples,
           (SELECT count(*) FROM correlations) AS correlations,
           (SELECT count(*) FROM sources) AS sources,
           (SELECT count(*) FROM quarantine) AS quarantine`
      )
      .then(r => r.rows[0]);

    expect(Number(counts.samples)).toBe(2); // standalone systolic + diastolic
    expect(Number(counts.correlations)).toBe(1); // the BP wrapper
    expect(Number(counts.sources)).toBe(1); // one Health source
    expect(Number(counts.quarantine)).toBe(0);

    const samples = await knex('samples')
      .select<Array<{ metric: string; value_num: number }>>('metric', 'value_num')
      .orderBy('metric');

    expect(samples).toEqual([
      { metric: 'blood_pressure_diastolic', value_num: 78 },
      { metric: 'blood_pressure_systolic', value_num: 135 }
    ]);
  });

  it('writes a Workout row when importing a running-workout fixture', async () => {
    await runImport({ filePath: join(FIXTURES_DIR, 'running-workout.xml') });
    await drainQueue();

    const knex = getKnex();
    const workout = await knex('workouts').first<{
      activity_type: string;
      duration_s: number;
      external_id: string;
      metadata: Record<string, unknown>;
    }>('activity_type', 'duration_s', 'external_id', 'metadata');

    expect(workout?.activity_type).toBe('running');
    expect(workout?.external_id).toBe('strava://activities/13205603309');
    expect(workout?.duration_s).toBe(30 * 60 + 25);
    expect((workout?.metadata as { rawActivityType: string }).rawActivityType).toBe('HKWorkoutActivityTypeRunning');
  });

  it('quarantines ActivitySummary envelopes (US-6)', async () => {
    await runImport({ filePath: join(FIXTURES_DIR, 'dtd-header-only.xml') });
    await drainQueue();

    const knex = getKnex();
    const quarantineRows = await knex('quarantine').select<Array<{ reason: string; vendor: string }>>(
      'reason',
      'vendor'
    );

    const reasons = quarantineRows.map(r => r.reason);

    expect(reasons).toContain('pre_aggregated');

    const samples = await knex('samples').count<{ count: string }>({ count: '*' }).first();

    expect(Number(samples?.count)).toBe(1); // the heart-rate Record
  });

  it('is idempotent on re-import (samples count stays stable)', async () => {
    const path = join(FIXTURES_DIR, 'bp-correlation.xml');

    await runImport({ filePath: path });
    await drainQueue();

    const knex = getKnex();
    const firstCount = await knex('samples').count<{ count: string }>({ count: '*' }).first();
    const firstCorr = await knex('correlations').count<{ count: string }>({ count: '*' }).first();

    await runImport({ filePath: path });
    await drainQueue();

    const secondCount = await knex('samples').count<{ count: string }>({ count: '*' }).first();
    const secondCorr = await knex('correlations').count<{ count: string }>({ count: '*' }).first();

    expect(secondCount?.count).toBe(firstCount?.count);
    expect(secondCorr?.count).toBe(firstCorr?.count);
  });

  it('preserves nested Workout > WorkoutActivity > WorkoutEvent in workouts.metadata.children', async () => {
    await runImport({ filePath: join(FIXTURES_DIR, 'multi-activity-workout.xml') });
    await drainQueue();

    const knex = getKnex();
    const workout = await knex('workouts').first<{ metadata: Record<string, unknown> }>('metadata');
    const children = (workout?.metadata.children ?? []) as Array<{ name: string; children: Array<{ name: string }> }>;

    const activities = children.filter(c => c.name === 'WorkoutActivity');

    expect(activities).toHaveLength(2);
    expect(activities[0].children.map(c => c.name)).toEqual(['WorkoutEvent', 'WorkoutStatistics']);
  });

  it('quarantines an unknown-alias Record', async () => {
    const knex = getKnex();

    const outcome = await processMessage(knex, {
      vendor: 'apple',
      batchId: 'test',
      payload: {
        kind: 'Record',
        attrs: {
          type: 'HKQuantityTypeIdentifierDietaryPotassium',
          sourceName: 'Lose It!',
          unit: 'mg',
          startDate: '2025-01-09 13:00:00 +0100',
          endDate: '2025-01-09 13:00:00 +0100',
          value: '500'
        },
        metadata: {},
        children: []
      }
    });

    expect(outcome.kind).toBe('quarantine');
    expect(outcome.reason).toBe('unknown_alias');

    const row = await knex('quarantine').first<{ reason: string; vendor: string }>('reason', 'vendor');

    expect(row?.reason).toBe('unknown_alias');
    expect(row?.vendor).toBe('apple');
  });
});
