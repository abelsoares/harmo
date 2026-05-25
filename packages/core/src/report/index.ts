import type { Knex } from 'knex';
import { collectReport, type ReportOptions } from './queries';
import { renderReport } from './render';

export * from './queries';
export * from './render';

export async function generateReport(knex: Knex, options: ReportOptions): Promise<string> {
  const data = await collectReport(knex, options);

  return renderReport(data);
}
