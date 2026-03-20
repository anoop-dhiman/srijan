import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const rootLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, ignore: 'pid,hostname' },
        },
      }),
});

export function createLogger(module: string) {
  return rootLogger.child({ module });
}
