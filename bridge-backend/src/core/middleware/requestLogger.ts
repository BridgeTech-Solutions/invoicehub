import morgan from 'morgan';
import winston from 'winston';
import { env } from '../../config/env';

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          }),
        ),
  ),
  transports: [new winston.transports.Console()],
});

// HTTP request logger utilisant morgan avec winston
export const httpLogger = morgan(
  env.NODE_ENV === 'production' ? 'combined' : 'dev',
  {
    stream: {
      write: (message: string) => {
        logger.http(message.trim());
      },
    },
  },
);
