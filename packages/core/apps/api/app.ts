import cors from '@koa/cors';
import { accessLogMiddleware } from '@src/api/middlewares/access-log';
import { errorHandlerMiddleware } from '@src/api/middlewares/error-handler';
import { requestIdMiddleware } from '@src/api/middlewares/request-id';
import { buildRouter } from '@src/api/router';
import { env } from '@src/clients/env';
import Koa from 'koa';
import koaQs from 'koa-qs';

export function buildApp(): Koa {
  const app = new Koa();

  // Enable repeatable query params like ?source_id=17&source_id=22 to parse as arrays.
  koaQs(app, 'extended');

  app.use(cors({ origin: env.API_CORS_ORIGIN }));
  app.use(requestIdMiddleware());
  app.use(accessLogMiddleware());
  app.use(errorHandlerMiddleware());

  const router = buildRouter();

  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}
