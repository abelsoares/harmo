import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50)
});

type Row = {
  id: string;
  status: string;
  source_file: string;
  started_at: Date;
  finished_at: Date | null;
  parsed_count: number;
  queued_count: number;
  error: string | null;
};

export function listImportsHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);
    const knex = getKnex();
    const rows = await knex('import_runs')
      .where('subject_id', subjectId)
      .orderBy('id', 'desc')
      .limit(parsed.limit)
      .select<Row[]>('*');

    ctx.body = {
      data: rows.map(r => ({
        id: r.id,
        status: r.status,
        source_file: r.source_file,
        started_at: r.started_at.toISOString(),
        finished_at: r.finished_at?.toISOString() ?? null,
        parsed_count: r.parsed_count,
        queued_count: r.queued_count,
        duration_ms: r.finished_at ? r.finished_at.getTime() - r.started_at.getTime() : null,
        error: r.error
      }))
    };
  };
}
