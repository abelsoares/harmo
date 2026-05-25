import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';
import { ApiError, type Cursor, decodeCursor, encodeCursor } from '../helpers/cursor';

const ListQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  activity_type: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(v => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  source_id: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform(v => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  cursor: z.string().optional()
});

type WorkoutRow = {
  id: string;
  source_id: string;
  source_name: string;
  activity_type: string;
  start_time: Date;
  end_time: Date;
  duration_s: number;
  external_id: string;
  metadata: Record<string, unknown>;
};

function toResponse(row: WorkoutRow) {
  return {
    id: row.id,
    source_id: row.source_id,
    source_name: row.source_name,
    activity_type: row.activity_type,
    start_time: row.start_time.toISOString(),
    end_time: row.end_time.toISOString(),
    duration_s: row.duration_s,
    external_id: row.external_id,
    metadata: row.metadata
  };
}

export function listWorkoutsHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = ListQuerySchema.parse(ctx.query);
    const knex = getKnex();
    const order = parsed.order;
    const cursor: Cursor | null = parsed.cursor ? decodeCursor(parsed.cursor) : null;

    let q = knex('workouts')
      .join('sources', 'sources.id', 'workouts.source_id')
      .where('workouts.subject_id', subjectId)
      .andWhere('workouts.start_time', '>=', parsed.from)
      .andWhere('workouts.start_time', '<', parsed.to);

    if (parsed.activity_type && parsed.activity_type.length > 0) {
      q = q.whereIn('workouts.activity_type', parsed.activity_type);
    }

    if (parsed.source_id && parsed.source_id.length > 0) {
      q = q.whereIn('workouts.source_id', parsed.source_id);
    }

    if (cursor) {
      const cmp = order === 'asc' ? '>' : '<';

      q = q.andWhereRaw(`(workouts.start_time, workouts.id) ${cmp} (?, ?)`, [cursor.t, cursor.i]);
    }

    const rows = await q
      .orderBy([
        { column: 'workouts.start_time', order },
        { column: 'workouts.id', order }
      ])
      .limit(parsed.limit + 1)
      .select<WorkoutRow[]>(
        'workouts.id as id',
        'workouts.source_id as source_id',
        'sources.source_name as source_name',
        'workouts.activity_type as activity_type',
        'workouts.start_time as start_time',
        'workouts.end_time as end_time',
        'workouts.duration_s as duration_s',
        'workouts.external_id as external_id',
        'workouts.metadata as metadata'
      );

    const hasMore = rows.length > parsed.limit;
    const sliced = hasMore ? rows.slice(0, parsed.limit) : rows;
    const last = sliced[sliced.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ t: last.start_time.toISOString(), i: last.id }) : null;

    ctx.body = { data: sliced.map(toResponse), next_cursor: nextCursor };
  };
}

export function getWorkoutHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const workoutId = String(ctx.params.workoutId);
    const knex = getKnex();
    const row = await knex('workouts')
      .join('sources', 'sources.id', 'workouts.source_id')
      .where('workouts.subject_id', subjectId)
      .andWhere('workouts.id', workoutId)
      .first<WorkoutRow | undefined>(
        'workouts.id as id',
        'workouts.source_id as source_id',
        'sources.source_name as source_name',
        'workouts.activity_type as activity_type',
        'workouts.start_time as start_time',
        'workouts.end_time as end_time',
        'workouts.duration_s as duration_s',
        'workouts.external_id as external_id',
        'workouts.metadata as metadata'
      );

    if (!row) {
      throw new ApiError('not_found', `workout ${workoutId} not found`, 404);
    }

    ctx.body = { data: toResponse(row) };
  };
}
