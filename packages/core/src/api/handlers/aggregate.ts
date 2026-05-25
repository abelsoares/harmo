import { type AggregateBucket, type AggregateFn, aggregate } from '@src/aggregate';
import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';
import { z } from 'zod';
import { ApiError } from '../helpers/cursor';

const BUCKETS = ['hour', 'day', 'week', 'month'] as const;
const AGGS = ['sum', 'avg', 'min', 'max', 'latest'] as const;

const QuerySchema = z.object({
  metric: z.string().min(1),
  bucket: z.enum(BUCKETS),
  from: z.coerce.date(),
  to: z.coerce.date(),
  agg: z.enum(AGGS).optional(),
  timezone: z.string().optional()
});

export function aggregateHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);

    try {
      const rows = await aggregate(getKnex(), {
        subjectId,
        metric: parsed.metric,
        bucket: parsed.bucket as AggregateBucket,
        agg: parsed.agg as AggregateFn | undefined,
        from: parsed.from,
        to: parsed.to,
        timezone: parsed.timezone
      });

      ctx.body = {
        metric: parsed.metric,
        bucket: parsed.bucket,
        agg: parsed.agg ?? 'default',
        timezone: parsed.timezone ?? null,
        data: rows.map(r => ({
          bucket_start: r.bucketStart.toISOString(),
          value: r.value,
          sample_count: r.sampleCount
        }))
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (/unknown metric/.test(message)) {
        throw new ApiError('unknown_metric', message, 400, { metric: parsed.metric });
      }

      if (/supports quantity metrics only/.test(message)) {
        throw new ApiError('metric_is_category', message, 400, { metric: parsed.metric });
      }

      if (/not allowed for metric/.test(message)) {
        throw new ApiError('disallowed_agg', message, 400, { metric: parsed.metric, agg: parsed.agg });
      }

      throw err;
    }
  };
}
