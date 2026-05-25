import { z } from 'zod';

const envSchema = z.object({
  API_CORS_ORIGIN: z.string().default('*'),
  API_HOSTNAME: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4001),
  DB_HOST: z.string().min(1).default('localhost'),
  DB_NAME: z.string().min(1).default('harmo'),
  DB_PASSWORD: z.string().default('harmo'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1).default('harmo'),
  INGEST_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  WORKER_POLL_BATCH: z.coerce.number().int().positive().default(32),
  WORKER_VT_SECONDS: z.coerce.number().int().positive().default(30)
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
