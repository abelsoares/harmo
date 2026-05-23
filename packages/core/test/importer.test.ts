import { join } from 'node:path';
import { runImport } from '@apps/importer/index';
import { INGEST_QUEUE } from '@harmo/common';
import { getKnex } from '@src/clients';
import { beforeEach, describe, expect, it } from 'vitest';
import { peekMessages, purgeQueue, queueLength } from './helpers/pgmq';

const FIXTURES_DIR = join(__dirname, 'fixtures/apple');

async function resetState() {
  const knex = getKnex();

  await knex('import_runs').delete();
  await knex('quarantine').delete();
  await purgeQueue(knex, INGEST_QUEUE);
}

describe('runImport', () => {
  beforeEach(resetState);

  it('imports a Correlation fixture: writes import_runs row + enqueues 3 envelopes', async () => {
    const result = await runImport({ filePath: join(FIXTURES_DIR, 'bp-correlation.xml') });

    expect(result.status).toBe('finished');
    expect(result.parsedCount).toBe(3); // 1 Correlation + 2 standalone Records
    expect(result.queuedCount).toBe(3);

    const knex = getKnex();
    const row = await knex('import_runs')
      .where({ id: result.runId })
      .first<{ status: string; parsed_count: number; queued_count: number; finished_at: Date | null }>();

    expect(row?.status).toBe('finished');
    expect(row?.parsed_count).toBe(3);
    expect(row?.queued_count).toBe(3);
    expect(row?.finished_at).not.toBeNull();

    expect(await queueLength(knex, INGEST_QUEUE)).toBe(3);

    const messages = await peekMessages<{ vendor: string; batchId: string; payload: { kind: string } }>(
      knex,
      INGEST_QUEUE,
      5
    );

    expect(messages.map(m => m.message.payload.kind)).toEqual(['Correlation', 'Record', 'Record']);
    expect(messages.every(m => m.message.vendor === 'apple')).toBe(true);
    expect(messages.every(m => m.message.batchId === result.runId)).toBe(true);
  });

  it('flushes the final partial batch (batch_size > envelope count)', async () => {
    const result = await runImport({
      filePath: join(FIXTURES_DIR, 'bp-correlation.xml'),
      batchSize: 100
    });

    expect(result.queuedCount).toBe(3);
    expect(await queueLength(getKnex(), INGEST_QUEUE)).toBe(3);
  });

  it('respects batch_size and pushes multiple batches', async () => {
    const result = await runImport({
      filePath: join(FIXTURES_DIR, 'bp-correlation.xml'),
      batchSize: 2
    });

    // 3 envelopes / batch_size 2 → batches of 2 then 1
    expect(result.queuedCount).toBe(3);
    expect(await queueLength(getKnex(), INGEST_QUEUE)).toBe(3);
  });

  it('records failure when the file does not exist', async () => {
    const result = await runImport({ filePath: '/tmp/harmo-does-not-exist.xml' });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/ENOENT/);
    expect(result.parsedCount).toBe(0);
    expect(result.queuedCount).toBe(0);

    const knex = getKnex();
    const row = await knex('import_runs')
      .where({ id: result.runId })
      .first<{ status: string; error: string | null; finished_at: Date | null }>();

    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/ENOENT/);
    expect(row?.finished_at).not.toBeNull();
  });

  it('re-running the same file enqueues duplicates safely', async () => {
    const path = join(FIXTURES_DIR, 'bp-correlation.xml');

    const first = await runImport({ filePath: path });
    const second = await runImport({ filePath: path });

    expect(first.runId).not.toBe(second.runId);
    expect(first.status).toBe('finished');
    expect(second.status).toBe('finished');

    const knex = getKnex();
    const runs = await knex('import_runs').select('*');

    expect(runs).toHaveLength(2);
    expect(await queueLength(knex, INGEST_QUEUE)).toBe(6);
  });

  it('imports the multi-activity workout fixture with nested children intact', async () => {
    const result = await runImport({ filePath: join(FIXTURES_DIR, 'multi-activity-workout.xml') });

    expect(result.status).toBe('finished');
    expect(result.parsedCount).toBe(1);

    const messages = await peekMessages<{ payload: { kind: string; children: Array<{ name: string }> } }>(
      getKnex(),
      INGEST_QUEUE,
      5
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].message.payload.kind).toBe('Workout');

    const activityNames = messages[0].message.payload.children.map(c => c.name);

    expect(activityNames).toEqual(['WorkoutActivity', 'WorkoutActivity']);
  });
});
