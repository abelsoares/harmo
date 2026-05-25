import Router from '@koa/router';
import { aggregateHandler } from './handlers/aggregate';
import { listCorrelationsHandler } from './handlers/correlations';
import { healthHandler } from './handlers/health';
import { listImportsHandler } from './handlers/imports';
import { listMetricsHandler } from './handlers/metrics';
import { listSamplesHandler } from './handlers/samples';
import { listSourcesHandler } from './handlers/sources';
import { getSummaryHandler } from './handlers/summary';
import { getWorkoutHandler, listWorkoutsHandler } from './handlers/workouts';

export function buildRouter(): Router {
  const router = new Router({ prefix: '/v1' });

  router.get('/health', healthHandler());
  router.get('/metrics', listMetricsHandler());

  // Subject-scoped resources. v1 only accepts subjectId = 'default'; future versions
  // will route by real subject identity (v3 auth + multi-tenant).
  router.get('/subjects/:subjectId/sources', listSourcesHandler());
  router.get('/subjects/:subjectId/samples', listSamplesHandler());
  router.get('/subjects/:subjectId/aggregate', aggregateHandler());
  router.get('/subjects/:subjectId/workouts', listWorkoutsHandler());
  router.get('/subjects/:subjectId/workouts/:workoutId', getWorkoutHandler());
  router.get('/subjects/:subjectId/correlations', listCorrelationsHandler());
  router.get('/subjects/:subjectId/summary', getSummaryHandler());
  router.get('/subjects/:subjectId/imports', listImportsHandler());

  return router;
}
