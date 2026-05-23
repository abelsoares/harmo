import { ZodError } from 'zod';
import { logger } from '../clients/logger';
import { captureException } from '../clients/sentry';

export class HarmoError extends Error {
  code: string;
  context?: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.context = context;
    this.name = 'HarmoError';
  }
}

export class QuarantineableError extends HarmoError {
  reason: string;
  raw: unknown;

  constructor(reason: string, message: string, raw: unknown, context?: Record<string, unknown>) {
    super(`quarantine.${reason}`, message, context);
    this.reason = reason;
    this.raw = raw;
    this.name = 'QuarantineableError';
  }
}

export type ErrorMapper = (error: unknown) => { handled: boolean; rethrow?: unknown };

const zodErrorMapper: ErrorMapper = error => {
  if (error instanceof ZodError) {
    logger.warn({ issues: error.issues }, 'zod validation failed');

    return { handled: true };
  }

  return { handled: false };
};

const unknownErrorMapper: ErrorMapper = error => {
  logger.error({ err: error }, 'unhandled error');
  captureException(error);

  return { handled: true };
};

export const defaultErrorMappers: ErrorMapper[] = [zodErrorMapper, unknownErrorMapper];

export function mapError(error: unknown, mappers: ErrorMapper[] = defaultErrorMappers): void {
  for (const mapper of mappers) {
    const result = mapper(error);

    if (result.handled) {
      return;
    }
  }
}
