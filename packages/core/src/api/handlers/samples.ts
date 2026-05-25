import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';
import { type Cursor, decodeCursor, encodeCursor } from '../helpers/cursor';

const QuerySchema = z.object({
  metric: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
  source_id: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(v => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  cursor: z.string().optional()
});

type Row = {
  id: string;
  metric: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  start_time: Date;
  end_time: Date;
  start_offset_minutes: number | null;
  source_id: string;
  workout_id: string | null;
  correlation_id: string | null;
  external_id: string;
  registry_version: number;
  metadata: Record<string, unknown>;
  ingested_at: Date;
};

export function listSamplesHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);
    const knex = getKnex();
    const order = parsed.order;
    const cursor: Cursor | null = parsed.cursor ? decodeCursor(parsed.cursor) : null;

    let query = knex('samples')
      .where('subject_id', subjectId)
      .andWhere('metric', parsed.metric)
      .andWhere('start_time', '>=', parsed.from)
      .andWhere('start_time', '<', parsed.to);

    if (parsed.source_id && parsed.source_id.length > 0) {
      query = query.whereIn(
        'source_id',
        parsed.source_id.map(id => id)
      );
    }

    if (cursor) {
      const cmp = order === 'asc' ? '>' : '<';

      query = query.andWhereRaw(`(start_time, id) ${cmp} (?, ?)`, [cursor.t, cursor.i]);
    }

    const rows = await query
      .orderBy([
        { column: 'start_time', order },
        { column: 'id', order }
      ])
      .limit(parsed.limit + 1)
      .select<Row[]>('*');

    const hasMore = rows.length > parsed.limit;
    const sliced = hasMore ? rows.slice(0, parsed.limit) : rows;
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ t: last.start_time.toISOString(), i: last.id }) : null;

    ctx.body = {
      data: sliced.map(r => ({
        id: r.id,
        metric: r.metric,
        value_num: r.value_num,
        value_text: r.value_text,
        unit: r.unit,
        start_time: r.start_time.toISOString(),
        end_time: r.end_time.toISOString(),
        start_offset_minutes: r.start_offset_minutes,
        source_id: r.source_id,
        workout_id: r.workout_id,
        correlation_id: r.correlation_id,
        external_id: r.external_id,
        registry_version: r.registry_version,
        metadata: r.metadata,
        ingested_at: r.ingested_at.toISOString()
      })),
      next_cursor: nextCursor
    };
  };
}
