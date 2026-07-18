/**
 * Vaakly-inspired messaging — clear API user messages and meaningful log lines.
 * Offline-first templates; optional enrichment later via Vaakly (Python).
 * VaagaTech · https://www.vaagatech.com
 */

export type MessageCode =
  | "OK_SEARCH"
  | "OK_INDEX_CREATED"
  | "OK_INDEX_DELETED"
  | "OK_INDEX_LISTED"
  | "OK_DOC_INDEXED"
  | "OK_DOC_DELETED"
  | "OK_BULK"
  | "OK_HEALTH"
  | "OK_STATS"
  | "ERR_INDEX_NOT_FOUND"
  | "ERR_INDEX_EXISTS"
  | "ERR_DOC_NOT_FOUND"
  | "ERR_VALIDATION"
  | "ERR_VECTOR_DIM"
  | "ERR_UNAUTHORIZED"
  | "ERR_RATE_LIMIT"
  | "ERR_STORAGE"
  | "ERR_INTERNAL"
  | "ERR_EMPTY_QUERY";

interface MessageTemplate {
  user: string;
  log: string;
  httpStatus: number;
}

const TEMPLATES: Record<MessageCode, MessageTemplate> = {
  OK_SEARCH: {
    user: "Search completed successfully. Found {total} matching document(s) in {tookMs}ms.",
    log: "search.ok index={index} total={total} tookMs={tookMs} mode={mode}",
    httpStatus: 200,
  },
  OK_INDEX_CREATED: {
    user: "Index \"{name}\" is ready. You can start indexing documents now.",
    log: "index.created name={name}",
    httpStatus: 201,
  },
  OK_INDEX_DELETED: {
    user: "Index \"{name}\" and its documents have been removed.",
    log: "index.deleted name={name}",
    httpStatus: 200,
  },
  OK_INDEX_LISTED: {
    user: "Retrieved {count} index(es).",
    log: "index.listed count={count}",
    httpStatus: 200,
  },
  OK_DOC_INDEXED: {
    user: "Document \"{id}\" was indexed in \"{index}\".",
    log: "doc.indexed index={index} id={id}",
    httpStatus: 201,
  },
  OK_DOC_DELETED: {
    user: "Document \"{id}\" was deleted from \"{index}\".",
    log: "doc.deleted index={index} id={id}",
    httpStatus: 200,
  },
  OK_BULK: {
    user: "Bulk indexing finished: {indexed} indexed, {failed} failed.",
    log: "bulk.indexed index={index} indexed={indexed} failed={failed}",
    httpStatus: 200,
  },
  OK_HEALTH: {
    user: "Anvesh is healthy and accepting requests.",
    log: "health.ok uptimeMs={uptimeMs} storage={storage}",
    httpStatus: 200,
  },
  OK_STATS: {
    user: "Cluster statistics collected successfully.",
    log: "stats.ok indexes={indexes} documents={documents}",
    httpStatus: 200,
  },
  ERR_INDEX_NOT_FOUND: {
    user: "We could not find an index named \"{name}\". Create it first, then try again.",
    log: "index.not_found name={name}",
    httpStatus: 404,
  },
  ERR_INDEX_EXISTS: {
    user: "An index named \"{name}\" already exists. Choose another name or delete the existing index.",
    log: "index.exists name={name}",
    httpStatus: 409,
  },
  ERR_DOC_NOT_FOUND: {
    user: "Document \"{id}\" was not found in index \"{index}\".",
    log: "doc.not_found index={index} id={id}",
    httpStatus: 404,
  },
  ERR_VALIDATION: {
    user: "The request could not be processed: {detail}",
    log: "validation.failed detail={detail}",
    httpStatus: 400,
  },
  ERR_VECTOR_DIM: {
    user: "Vector dimension mismatch: expected {expected}, received {received}. Align embeddings with the index settings.",
    log: "vector.dim_mismatch expected={expected} received={received}",
    httpStatus: 400,
  },
  ERR_UNAUTHORIZED: {
    user: "Authentication failed. Provide a valid API key in the Authorization header.",
    log: "auth.unauthorized",
    httpStatus: 401,
  },
  ERR_RATE_LIMIT: {
    user: "Too many requests. Please wait a moment and try again.",
    log: "rate_limit.exceeded",
    httpStatus: 429,
  },
  ERR_STORAGE: {
    user: "Storage is temporarily unavailable. Your request was not persisted. Please retry shortly.",
    log: "storage.error detail={detail}",
    httpStatus: 503,
  },
  ERR_INTERNAL: {
    user: "Something went wrong on our side. Please retry; if it continues, contact support with request id {requestId}.",
    log: "internal.error requestId={requestId} detail={detail}",
    httpStatus: 500,
  },
  ERR_EMPTY_QUERY: {
    user: "Provide a text query (q), a vector, a geo filter, or a combination before searching.",
    log: "search.empty_query index={index}",
    httpStatus: 400,
  },
};

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

export function formatMessage(
  code: MessageCode,
  vars: Record<string, string | number | undefined> = {},
): FormattedMessage {
  const t = TEMPLATES[code];
  return {
    code,
    message: fill(t.user, vars),
    logLine: fill(t.log, vars),
    httpStatus: t.httpStatus,
  };
}

/** Build a consistent API envelope. */
export function apiEnvelope<T extends Record<string, unknown>>(
  code: MessageCode,
  data: T,
  vars: Record<string, string | number | undefined> = {},
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
  readonly details?: Record<string, string | number | undefined>;

  constructor(code: MessageCode, vars: Record<string, string | number | undefined> = {}) {
    const formatted = formatMessage(code, vars);
    super(formatted.message);
    this.name = "AnveshError";
    this.code = code;
    this.httpStatus = formatted.httpStatus;
    this.logLine = formatted.logLine;
    this.details = vars;
  }
}
