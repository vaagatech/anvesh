/**
 * Structured logger with meaningful Vaakly-style lines.
 */
import pino, { type Logger } from "pino";
import type { MessageCode } from "../messaging/vaakly.js";
import { formatMessage } from "../messaging/vaakly.js";

export interface LogContext {
  requestId?: string;
  index?: string;
  [key: string]: unknown;
}

let rootLogger: Logger | null = null;

export function createLogger(options?: {
  level?: string;
  pretty?: boolean;
  service?: string;
}): Logger {
  const level = options?.level ?? process.env.ANVESH_LOG_LEVEL ?? "info";
  const pretty =
    options?.pretty ??
    (process.env.ANVESH_LOG_PRETTY === "1" || process.env.NODE_ENV !== "production");

  rootLogger = pino({
    level,
    base: {
      service: options?.service ?? "anvesh",
      product: "anvesh",
      vendor: "vaagatech",
    },
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }
      : {}),
  });
  return rootLogger;
}

export function getLogger(): Logger {
  if (!rootLogger) {
    return createLogger();
  }
  return rootLogger;
}

export function logMessage(
  code: MessageCode,
  vars: Record<string, string | number | undefined> = {},
  ctx: LogContext = {},
): void {
  const formatted = formatMessage(code, vars);
  const logger = getLogger();
  const payload = { code, ...ctx, ...vars, msg: formatted.logLine };
  if (formatted.httpStatus >= 500) {
    logger.error(payload);
  } else if (formatted.httpStatus >= 400) {
    logger.warn(payload);
  } else {
    logger.info(payload);
  }
}
