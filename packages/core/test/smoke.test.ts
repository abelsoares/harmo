import { METRICS, REGISTRY_VERSION } from '@harmo/common';
import { getKnex } from '@src/clients';
import { describe, expect, it } from 'vitest';

describe('bootstrap smoke', () => {
  it('connects to postgres', async () => {
    const knex = getKnex();
    const result = await knex.raw<{ rows: Array<{ one: number }> }>('SELECT 1 AS one');

    expect(result.rows[0].one).toBe(1);
  });

  it('has the default subject seeded with a timezone', async () => {
    const knex = getKnex();
    const subject = await knex('subjects').where('id', 'default').first<{ id: string; timezone: string }>();

    expect(subject).toBeDefined();
    expect(subject?.timezone).toBeTruthy();
  });

  it('loads the canonical metrics registry from migrations', async () => {
    const knex = getKnex();
    const count = await knex('metrics_registry').count<{ count: string }>({ count: '*' }).first();

    expect(Number(count?.count ?? 0)).toBe(METRICS.length);
  });

  it('marks every registry row with the current REGISTRY_VERSION', async () => {
    const knex = getKnex();
    const rows = await knex('metrics_registry').select<{ registry_version: number }[]>('registry_version');

    expect(rows.every(r => r.registry_version === REGISTRY_VERSION)).toBe(true);
  });

  it('exposes the samples table as partitioned', async () => {
    const knex = getKnex();
    const row = await knex
      .raw<{ rows: Array<{ partstrat: string | null }> }>(
        "SELECT partstrat FROM pg_partitioned_table p JOIN pg_class c ON c.oid = p.partrelid WHERE c.relname = 'samples'"
      )
      .then(r => r.rows[0]);

    expect(row?.partstrat).toBe('r');
  });

  it('has the pgmq ingest_q queue available', async () => {
    const knex = getKnex();
    const result = await knex.raw<{ rows: Array<{ queue_name: string }> }>(
      "SELECT queue_name FROM pgmq.list_queues() WHERE queue_name = 'ingest_q'"
    );

    expect(result.rows[0]?.queue_name).toBe('ingest_q');
  });
});
