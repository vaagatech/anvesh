/**
 * Starts the isolated Anvesh stack once for the whole e2e run.
 * Persists connection info for test workers; teardown stops everything.
 */
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import {
  HubClient,
  startFixtureSite,
  startMockElasticsearch,
  startMockSolr,
  startStack,
  type E2EEnv,
  type FixtureSite,
  type StackHandle,
} from "./helpers/stack.js";
import { CONTEXT_FILE } from "./helpers/paths.js";

export interface PersistedContext {
  env: E2EEnv;
  engineId: string;
  spiderId: string;
  indexerId: string;
  fixtureUrl: string;
  mockEsUrl: string;
  mockSolrUrl: string;
}

let stack: StackHandle | null = null;
let fixture: FixtureSite | null = null;
let mockEs: FixtureSite | null = null;
let mockSolr: FixtureSite | null = null;

export default async function setup() {
  fixture = await startFixtureSite();
  mockEs = await startMockElasticsearch();
  mockSolr = await startMockSolr();
  stack = await startStack();

  const admin = HubClient.forStack(stack.env);
  await admin.login(stack.env.ANVESH_HUB_ADMIN_USER, stack.env.ANVESH_HUB_ADMIN_PASSWORD);
  const fleet = await admin.request<{
    instances: Array<{ id: string; kind: string }>;
  }>("GET", "/hub/instances");

  const persisted: PersistedContext = {
    env: stack.env,
    engineId: fleet.instances.find((i) => i.kind === "engine")!.id,
    spiderId: fleet.instances.find((i) => i.kind === "spider")!.id,
    indexerId: fleet.instances.find((i) => i.kind === "indexer")!.id,
    fixtureUrl: fixture.baseUrl,
    mockEsUrl: mockEs.baseUrl,
    mockSolrUrl: mockSolr.baseUrl,
  };

  await mkdir(path.dirname(CONTEXT_FILE), { recursive: true });
  await writeFile(CONTEXT_FILE, JSON.stringify(persisted, null, 2), "utf8");

  return async () => {
    await mockEs?.close().catch(() => undefined);
    await mockSolr?.close().catch(() => undefined);
    await fixture?.close().catch(() => undefined);
    await stack?.stop().catch(() => undefined);
  };
}
