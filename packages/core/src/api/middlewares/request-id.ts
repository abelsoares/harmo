import { randomUUID } from 'node:crypto';
import { runWithContext } from '@src/clients/logger';
import type { Middleware } from 'koa';

export function requestIdMiddleware(): Middleware {
  return async (ctx, next) => {
    const requestId = (ctx.get('x-request-id') || randomUUID()).slice(0, 128);

    ctx.set('x-request-id', requestId);
    ctx.state.requestId = requestId;

    await runWithContext({ runId: requestId }, async () => {
      await next();
    });
  };
}
