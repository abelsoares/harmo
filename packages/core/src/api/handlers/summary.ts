import { getKnex } from '@src/clients/knex';
import { collectReport } from '@src/report/queries';
import type { Middleware } from 'koa';
import { z } from 'zod';

const QuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  timezone: z.string().optional()
});

export function getSummaryHandler(): Middleware {
  return async ctx => {
    const subjectId = String(ctx.params.subjectId);
    const parsed = QuerySchema.parse(ctx.query);
    const report = await collectReport(getKnex(), {
      subjectId,
      from: parsed.from,
      to: parsed.to,
      timezone: parsed.timezone
    });

    ctx.body = {
      data: {
        subject_id: report.subjectId,
        timezone: report.timezone,
        range: { from: report.range.from.toISOString(), to: report.range.to.toISOString() },
        totals: report.totals,
        per_metric: report.perMetric.map(m => ({
          metric: m.metric,
          sample_count: m.sampleCount,
          first_at: m.firstAt?.toISOString() ?? null,
          last_at: m.lastAt?.toISOString() ?? null
        })),
        workouts_by_activity: report.workouts.byActivity.map(w => ({
          activity_type: w.activityType,
          count: w.count,
          total_duration_seconds: w.totalDurationSeconds
        })),
        sources_count: report.totals.sources
      }
    };
  };
}
