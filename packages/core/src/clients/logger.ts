import { AsyncLocalStorage } from 'node:async_hooks';
import { pino } from 'pino';
import { env } from './env';

type LogContext = {
  batchId?: string;
  runId?: string;
  messageId?: string | number;
};

const contextStorage = new AsyncLocalStorage<LogContext>();

const baseLogger = pino({
  level: env.LOG_LEVEL,
  mixin() {
    return contextStorage.getStore() ?? {};
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined
});

export const logger = baseLogger;

export function runWithContext<T>(context: LogContext, fn: () => T): T {
  const merged = { ...(contextStorage.getStore() ?? {}), ...context };

  return contextStorage.run(merged, fn);
}

export function getContext(): LogContext {
  return contextStorage.getStore() ?? {};
}
