import { logger } from '@src/clients/logger';
import { captureException } from '@src/clients/sentry';
import type { Middleware } from 'koa';
import { ZodError } from 'zod';
import { ApiError } from '../helpers/cursor';

export function errorHandlerMiddleware(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (err instanceof ApiError) {
        ctx.status = err.status;
        ctx.body = { error: { code: err.code, message: err.message, details: err.details } };

        return;
      }

      if (err instanceof ZodError) {
        ctx.status = 400;
        ctx.body = {
          error: {
            code: 'validation_failed',
            message: 'request did not pass validation',
            details: { issues: err.issues }
          }
        };

        return;
      }

      logger.error({ err, path: ctx.path }, 'unhandled api error');
      captureException(err, { path: ctx.path });

      ctx.status = 500;
      ctx.body = {
        error: { code: 'internal_error', message: 'an unexpected error occurred' }
      };
    }
  };
}
