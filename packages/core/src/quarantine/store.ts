import type { Knex } from 'knex';

export type QuarantineInput = {
  subjectId: string;
  vendor: string;
  reason: string;
  raw: unknown;
  context?: Record<string, unknown>;
  registryVersion?: number;
};

export async function storeQuarantine(knex: Knex, input: QuarantineInput): Promise<void> {
  await knex('quarantine').insert({
    subject_id: input.subjectId,
    vendor: input.vendor,
    reason: input.reason,
    raw: JSON.stringify(input.raw),
    context: JSON.stringify(input.context ?? {}),
    registry_version: input.registryVersion ?? null
  });
}
