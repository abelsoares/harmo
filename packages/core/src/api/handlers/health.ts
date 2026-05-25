import { REGISTRY_VERSION } from '@harmo/common';
import { getKnex } from '@src/clients/knex';
import type { Middleware } from 'koa';

const startedAt = new Date();

export function healthHandler(): Middleware {
  return async ctx => {
    const knex = getKnex();
    const dbCheck = await knex
      .raw<{ rows: Array<{ ok: number }> }>('SELECT 1 AS ok')
      .then(r => r.rows[0]?.ok === 1)
      .catch(() => false);

    ctx.body = {
      data: {
        status: dbCheck ? 'ok' : 'degraded',
        registry_version: REGISTRY_VERSION,
        db: { connected: dbCheck },
        started_at: startedAt.toISOString()
      }
    };
  };
}
