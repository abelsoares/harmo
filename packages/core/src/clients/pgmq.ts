import type { Knex } from 'knex';

export type PgmqMessage<T = unknown> = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: T;
};

export async function createQueue(knex: Knex, name: string): Promise<void> {
  await knex.raw('SELECT pgmq.create(?)', [name]);
}

export async function sendBatch<T>(knex: Knex, queue: string, messages: T[]): Promise<number[]> {
  if (messages.length === 0) {
    return [];
  }

  const rows = await knex.raw<{ rows: Array<{ send_batch: number }> }>(
    'SELECT pgmq.send_batch(?, ?::jsonb[]) AS send_batch',
    [queue, messages.map(m => JSON.stringify(m))]
  );

  return rows.rows.map(r => r.send_batch);
}

export async function read<T>(knex: Knex, queue: string, vtSeconds: number, qty: number): Promise<PgmqMessage<T>[]> {
  const result = await knex.raw<{ rows: PgmqMessage<T>[] }>(
    'SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.read(?, ?, ?)',
    [queue, vtSeconds, qty]
  );

  return result.rows;
}

export async function archive(knex: Knex, queue: string, msgId: number): Promise<void> {
  await knex.raw('SELECT pgmq.archive(?, ?)', [queue, msgId]);
}

export async function deleteMessage(knex: Knex, queue: string, msgId: number): Promise<void> {
  await knex.raw('SELECT pgmq.delete(?, ?)', [queue, msgId]);
}
