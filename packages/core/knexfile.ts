import type { Knex } from 'knex';
import { env } from './src/clients/env';

const config: Knex.Config = {
  client: 'pg',
  connection: {
    database: env.DB_NAME,
    host: env.DB_HOST,
    password: env.DB_PASSWORD,
    port: env.DB_PORT,
    user: env.DB_USER
  },
  migrations: {
    directory: './migrations',
    extension: 'ts'
  },
  pool: { min: 0, max: 10 }
};

export default config;
