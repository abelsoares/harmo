import knexFactory, { type Knex } from 'knex';
import { Model } from 'objection';
import { env } from './env';

let knexInstance: Knex | null = null;

export function getKnex(): Knex {
  if (knexInstance) {
    return knexInstance;
  }

  knexInstance = knexFactory({
    client: 'pg',
    connection: {
      database: env.DB_NAME,
      host: env.DB_HOST,
      password: env.DB_PASSWORD,
      port: env.DB_PORT,
      user: env.DB_USER
    },
    pool: { min: 0, max: 10 }
  });

  Model.knex(knexInstance);

  return knexInstance;
}

export async function closeKnex(): Promise<void> {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}
