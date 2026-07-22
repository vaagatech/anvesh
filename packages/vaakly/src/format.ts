/**
 * formatMessage / apiEnvelope / AnveshError
 */
import { correctSummary } from "./correct.js";
import { TEMPLATES, type MessageCode } from "./templates.js";

export type { MessageCode } from "./templates.js";

function fill(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export interface FormattedMessage {
  code: MessageCode;
  message: string;
  logLine: string;
  httpStatus: number;
}

export type MessageVars = Record<string, string | number | undefined>;

/**
 * Format a Vaakly message and correct the user-facing summary
 * (plurals, empty results, tone).
 */
export function formatMessage(code: MessageCode, vars: MessageVars = {}): FormattedMessage {
  const t = TEMPLATES[code];
  if (!t) {
    return {
      code,
      message: correctSummary({ message: String(code), code, vars }),
      logLine: `unknown.code code=${code}`,
      httpStatus: 500,
    };
  }
  const draft = fill(t.user, vars);
  return {
    code,
    message: correctSummary({ message: draft, code, vars }),
    logLine: fill(t.log, vars),
    httpStatus: t.httpStatus,
  };
}

/** Build a consistent API envelope. */
export function apiEnvelope<T extends Record<string, unknown>>(
  code: MessageCode,
  data: T,
  vars: MessageVars = {},
): T & { code: MessageCode; message: string; ok: boolean } {
  const formatted = formatMessage(code, vars);
  return {
    ok: formatted.httpStatus < 400,
    code,
    message: formatted.message,
    ...data,
  };
}

export class AnveshError extends Error {
  readonly code: MessageCode;
  readonly httpStatus: number;
  readonly logLine: string;
  readonly details?: MessageVars;

  constructor(code: MessageCode, vars: MessageVars = {}) {
    const formatted = formatMessage(code, vars);
    super(formatted.message);
    this.name = "AnveshError";
    this.code = code;
    this.httpStatus = formatted.httpStatus;
    this.logLine = formatted.logLine;
    this.details = vars;
  }
}
