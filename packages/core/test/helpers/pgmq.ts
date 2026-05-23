import type { Knex } from 'knex';

export async function purgeQueue(knex: Knex, queue: string): Promise<void> {
  await knex.raw('SELECT pgmq.purge_queue(?)', [queue]);
}

export async function queueLength(knex: Knex, queue: string): Promise<number> {
  const result = await knex.raw<{ rows: Array<{ count: string }> }>(
    `SELECT count(*)::int AS count FROM pgmq.q_${queue.replace(/[^a-z0-9_]/gi, '')}`
  );

  return Number(result.rows[0]?.count ?? 0);
}

export async function peekMessages<T = unknown>(
  knex: Knex,
  queue: string,
  limit = 10
): Promise<Array<{ msg_id: number; message: T }>> {
  const result = await knex.raw<{ rows: Array<{ msg_id: number; message: T }> }>(
    `SELECT msg_id, message FROM pgmq.q_${queue.replace(/[^a-z0-9_]/gi, '')} ORDER BY msg_id LIMIT ?`,
    [limit]
  );

  return result.rows;
}
