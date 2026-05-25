import { REGISTRY_VERSION } from '@harmo/common';
import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';

export function listMetricsHandler(): Middleware {
  return async ctx => {
    const knex = getKnex();
    const rows = await knex('metrics_registry')
      .select<
        Array<{
          metric: string;
          value_kind: string;
          temporal_kind: string;
          canonical_unit: string | null;
          default_agg: string;
          allowed_aggs: string[];
          resolve_overlap: boolean;
          registry_version: number;
        }>
      >('*')
      .orderBy('metric');

    ctx.body = {
      registry_version: REGISTRY_VERSION,
      data: rows.map(r => ({
        metric: r.metric,
        value_kind: r.value_kind,
        temporal_kind: r.temporal_kind,
        canonical_unit: r.canonical_unit,
        default_agg: r.default_agg,
        allowed_aggs: r.allowed_aggs,
        resolve_overlap: r.resolve_overlap
      }))
    };
  };
}
