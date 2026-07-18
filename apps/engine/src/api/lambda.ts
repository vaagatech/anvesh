/**
 * AWS Lambda handler — API Gateway HTTP API / REST proxy integration.
 * Cold-start friendly: engine is reused across warm invocations.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "aws-lambda";
import { createAnveshApp } from "./server.js";
import type { FastifyInstance } from "fastify";
import { getLogger } from "../logging/logger.js";

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = createAnveshApp({
      storage: (process.env.ANVESH_STORAGE as "s3" | "dynamodb" | "redis" | "mongodb" | "memory") ?? "s3",
      loggerPretty: false,
    }).then(({ app }) => app);
  }
  return appPromise;
}

function eventToRequest(event: APIGatewayProxyEventV2): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  remoteAddress?: string;
} {
  const rawQuery = event.rawQueryString ? `?${event.rawQueryString}` : "";
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v !== undefined) headers[k.toLowerCase()] = v;
  }
  let body = event.body;
  if (body && event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf8");
  }
  return {
    method: event.requestContext.http.method,
    url: `${event.rawPath}${rawQuery}`,
    headers,
    body: body ?? undefined,
    remoteAddress: event.requestContext.http.sourceIp,
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> {
  context.callbackWaitsForEmptyEventLoop = false;
  const app = await getApp();
  const req = eventToRequest(event);

  const response = await app.inject({
    method: req.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
    url: req.url,
    headers: req.headers,
    payload: req.body,
    remoteAddress: req.remoteAddress,
  });

  getLogger().info(
    {
      requestId: context.awsRequestId,
      statusCode: response.statusCode,
      path: req.url,
      method: req.method,
    },
    `lambda.request status=${response.statusCode} path=${req.url}`,
  );

  const respHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(response.headers)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      respHeaders[k] = String(v);
    }
  }

  return {
    statusCode: response.statusCode,
    headers: respHeaders,
    body: response.body,
  };
}

export default handler;
