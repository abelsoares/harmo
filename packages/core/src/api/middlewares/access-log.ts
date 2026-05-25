import { logger } from '@src/clients/logger';
import type { Middleware } from 'koa';

export function accessLogMiddleware(): Middleware {
  return async (ctx, next) => {
    const start = Date.now();

    await next();

    const ms = Date.now() - start;

    logger.info(
      {
        method: ctx.method,
        path: ctx.path,
        status: ctx.status,
        durationMs: ms,
        ip: ctx.ip
      },
      'http request'
    );
  };
}
