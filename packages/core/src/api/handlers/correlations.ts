import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';

const QuerySchema = z.object({
  metric: z.string().min(1).optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  include_linked_samples: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform(v => v === 'true')
});

type CorrelationRow = {
  id: string;
  metric: string;
  source_id: string;
  source_name: string;
  start_time: Date;
  end_time: Date;
  external_id: string;
  metadata: Record<string, unknown>;
};

type SampleRow = {
  id: string;
  metric: string;
  value_num: number | null;
  value_text: string | null;
  unit: string | null;
  start_time: Date;
  end_time: Date;
  source_id: string;
};

export function listCorrelationsHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);
    const knex = getKnex();

    let q = knex('correlations')
      .join('sources', 'sources.id', 'correlations.source_id')
      .where('correlations.subject_id', subjectId)
      .andWhere('correlations.start_time', '>=', parsed.from)
      .andWhere('correlations.start_time', '<', parsed.to);

    if (parsed.metric) {
      q = q.andWhere('correlations.metric', parsed.metric);
    }

    const correlations = await q
      .orderBy('correlations.start_time', 'desc')
      .select<CorrelationRow[]>(
        'correlations.id as id',
        'correlations.metric as metric',
        'correlations.source_id as source_id',
        'sources.source_name as source_name',
        'correlations.start_time as start_time',
        'correlations.end_time as end_time',
        'correlations.external_id as external_id',
        'correlations.metadata as metadata'
      );

    let linkedBySource: Map<string, SampleRow[]> = new Map();

    if (parsed.include_linked_samples && correlations.length > 0) {
      // For each correlation, fetch samples that share (subject_id, source_id, start_time).
      // Apple's DTD guarantees correlation child Records exist standalone, so a temporal+source
      // match is the right linkage.
      const tuples = correlations.map(c => ({ src: c.source_id, t: c.start_time.toISOString() }));
      const rows = await knex.raw<{ rows: SampleRow[] }>(
        `SELECT id, metric, value_num, value_text, unit, start_time, end_time, source_id
         FROM samples
         WHERE subject_id = ?
           AND (source_id, start_time) IN (${tuples.map(() => '(?, ?::timestamptz)').join(', ')})`,
        [subjectId, ...tuples.flatMap(t => [t.src, t.t])]
      );

      linkedBySource = new Map();

      for (const s of rows.rows) {
        const key = `${s.source_id}|${s.start_time.toISOString()}`;
        const list = linkedBySource.get(key) ?? [];

        list.push(s);
        linkedBySource.set(key, list);
      }
    }

    ctx.body = {
      data: correlations.map(c => ({
        id: c.id,
        metric: c.metric,
        source_id: c.source_id,
        source_name: c.source_name,
        start_time: c.start_time.toISOString(),
        end_time: c.end_time.toISOString(),
        external_id: c.external_id,
        metadata: c.metadata,
        ...(parsed.include_linked_samples
          ? {
              linked_samples: (linkedBySource.get(`${c.source_id}|${c.start_time.toISOString()}`) ?? []).map(s => ({
                id: s.id,
                metric: s.metric,
                value_num: s.value_num,
                value_text: s.value_text,
                unit: s.unit,
                start_time: s.start_time.toISOString(),
                end_time: s.end_time.toISOString()
              }))
            }
          : {})
      }))
    };
  };
}
