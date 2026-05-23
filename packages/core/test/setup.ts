import { closeKnex, getKnex } from '@src/clients';
import { afterAll, beforeAll } from 'vitest';

beforeAll(async () => {
  const knex = getKnex();
  // Ensure DB is reachable before any test runs.
  await knex.raw('SELECT 1');
});

afterAll(async () => {
  await closeKnex();
});
