/**
 * Vaakly as an Anvesh plugin — tools mirror LLM tool calling.
 */
import type { AnveshPlugin } from "@vaagatech/anvesh-plugins";
import { correctSummary } from "./correct.js";
import { formatMessage, type MessageCode } from "./format.js";
import { TEMPLATES } from "./templates.js";

export const VAAKLY_PLUGIN_NAME = "vaakly";
export const VAAKLY_PLUGIN_VERSION = "0.2.0";

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return undefined;
}

/** Build the Vaakly messaging plugin (tools + correctSummary hook). */
export function createVaaklyPlugin(): AnveshPlugin {
  return {
    name: VAAKLY_PLUGIN_NAME,
    version: VAAKLY_PLUGIN_VERSION,
    description:
      "Corrects and formats Anvesh API summary messages — clear plurals, tone, and log lines.",
    kind: "messaging",
    hooks: {
      correctSummary: (message, meta) =>
        correctSummary({
          message,
          code: meta.code,
          vars: meta.vars as Record<string, string | number | boolean | undefined | null> | undefined,
        }),
    },
    tools: [
      {
        name: "vaakly.format_message",
        description:
          "Format an Anvesh message code into a corrected user-facing summary and log line.",
        parameters: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: `Message code. Known: ${Object.keys(TEMPLATES).join(", ")}`,
            },
            vars: {
              type: "object",
              description: "Template variables (total, tookMs, name, index, …)",
              additionalProperties: true,
            },
          },
          required: ["code"],
        },
        execute: (args) => {
          const code = asString(args.code) as MessageCode;
          const vars =
            args.vars && typeof args.vars === "object" && !Array.isArray(args.vars)
              ? (args.vars as Record<string, string | number | undefined>)
              : {};
          return formatMessage(code, vars);
        },
      },
      {
        name: "vaakly.correct_summary",
        description:
          "Correct a draft summary sentence (plurals, empty results, leftover placeholders).",
        parameters: {
          type: "object",
          properties: {
            message: { type: "string", description: "Draft summary to correct" },
            code: { type: "string", description: "Optional message code for structured rewrite" },
            total: { type: "number", description: "Hit count (for OK_SEARCH)" },
            count: { type: "number", description: "Index count (for OK_INDEX_LISTED)" },
            tookMs: { type: "number", description: "Search latency in ms" },
            indexed: { type: "number", description: "Bulk indexed count" },
            failed: { type: "number", description: "Bulk failed count" },
          },
          required: ["message"],
        },
        execute: (args) => {
          const corrected = correctSummary({
            message: asString(args.message),
            code: args.code != null ? asString(args.code) : undefined,
            total: asNumber(args.total),
            count: asNumber(args.count),
            tookMs: asNumber(args.tookMs),
            indexed: asNumber(args.indexed),
            failed: asNumber(args.failed),
          });
          return { message: corrected };
        },
      },
      {
        name: "vaakly.list_codes",
        description: "List Vaakly message codes with HTTP status and template preview.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: () =>
          Object.entries(TEMPLATES).map(([code, t]) => ({
            code,
            httpStatus: t.httpStatus,
            userTemplate: t.user,
            logTemplate: t.log,
          })),
      },
    ],
  };
}
