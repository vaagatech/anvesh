import { readFile } from "node:fs/promises";
import { HubClient, type E2EEnv } from "./stack.js";
import { CONTEXT_FILE } from "./paths.js";

export interface PersistedContext {
  env: E2EEnv;
  engineId: string;
  spiderId: string;
  indexerId: string;
  fixtureUrl: string;
  mockEsUrl: string;
  mockSolrUrl: string;
}

export const RICH_MAPPINGS = {
  title: { type: "text" as const },
  body: { type: "text" as const },
  url: { type: "keyword" as const },
  description: { type: "text" as const },
  category: { type: "keyword" as const },
  price: { type: "number" as const },
  status: { type: "number" as const },
  location: { type: "geo_point" as const },
};

export interface E2EContext {
  env: E2EEnv;
  admin: HubClient;
  engineId: string;
  spiderId: string;
  indexerId: string;
  fixtureUrl: string;
  mockEsUrl: string;
  mockSolrUrl: string;
}

let cached: E2EContext | null = null;
let richReady: Promise<string> | null = null;

export async function getE2EContext(): Promise<E2EContext> {
  if (cached) return cached;
  const raw = await readFile(CONTEXT_FILE, "utf8");
  const p = JSON.parse(raw) as PersistedContext;
  const admin = HubClient.forStack(p.env);
  await admin.login(p.env.ANVESH_HUB_ADMIN_USER, p.env.ANVESH_HUB_ADMIN_PASSWORD);
  cached = {
    env: p.env,
    admin,
    engineId: p.engineId,
    spiderId: p.spiderId,
    indexerId: p.indexerId,
    fixtureUrl: p.fixtureUrl,
    mockEsUrl: p.mockEsUrl,
    mockSolrUrl: p.mockSolrUrl,
  };
  return cached;
}

/** Seed a rich index once (shared across search/docs/geo tests). */
export async function ensureRichIndex(name = "e2e-rich"): Promise<string> {
  if (!richReady) {
    richReady = (async () => {
      const c = await getE2EContext();
      const listed = await c.admin.request<{ indexes: Array<{ name: string }> }>(
        "GET",
        `/hub/engines/${c.engineId}/indexes`,
      );
      if (listed.indexes.some((i) => i.name === name)) return name;

      await c.admin.request("POST", `/hub/engines/${c.engineId}/indexes`, {
        name,
        mappings: RICH_MAPPINGS,
        settings: { vectorDimensions: 256, autoEmbed: true, hybridKeywordWeight: 0.55 },
      });
      await c.admin.request("POST", `/hub/engines/${c.engineId}/indexes/${name}/ingest`, {
        validate: true,
        documents: [
          {
            id: "r1",
            fields: {
              title: "Alpine hiking trails",
              body: "Guide to mountain gear and trail running shoes near the peak",
              url: "https://example.test/alpine",
              category: "outdoors",
              price: 89,
              status: 200,
              location: { lat: 37.77, lon: -122.42 },
            },
          },
          {
            id: "r2",
            fields: {
              title: "Ceramic coffee mug",
              body: "Kitchen cup for espresso lovers",
              url: "https://example.test/mug",
              category: "kitchen",
              price: 12,
              status: 200,
              location: { lat: 37.78, lon: -122.41 },
            },
          },
          {
            id: "r3",
            fields: {
              title: "Elephant backpack",
              body: "Durable pack for long treks across savannah",
              url: "https://example.test/pack",
              category: "outdoors",
              price: 120,
              status: 404,
              location: { lat: 40.71, lon: -74.0 },
            },
          },
          {
            id: "r4",
            fields: {
              title: "Red running shoes",
              body: "Lightweight footwear for city jogging",
              url: "https://example.test/shoes",
              category: "footwear",
              price: 75,
              status: 200,
              location: { lat: 37.76, lon: -122.43 },
            },
          },
          {
            id: "r5",
            fields: {
              title: "Blue ceramic plate",
              body: "Dining plate set",
              url: "https://example.test/plate",
              category: "kitchen",
              price: 25,
              status: 201,
              location: { lat: 34.05, lon: -118.24 },
            },
          },
        ],
      });
      return name;
    })();
  }
  return richReady;
}
