/** Web crawl / bulk import index defaults — keep in sync with @vaagatech/anvesh-shared */
export const WEB_MAPPINGS = {
  title: { type: "text" },
  body: { type: "text" },
  url: { type: "keyword" },
  description: { type: "text" },
  roles: { type: "keyword" },
  status: { type: "number" },
  host: { type: "keyword" },
  path: { type: "keyword" },
  category: { type: "keyword" },
  page_type: { type: "keyword" },
  lang: { type: "keyword" },
  canonical: { type: "keyword" },
  author: { type: "keyword" },
  site_name: { type: "keyword" },
  content_type: { type: "keyword" },
  keywords: { type: "text" },
  headings: { type: "text" },
  word_count: { type: "number" },
  link_count: { type: "number" },
  depth: { type: "number" },
  published_at: { type: "date" },
  og_type: { type: "keyword" },
};

export const WEB_SETTINGS = {
  vectorDimensions: 256,
  autoEmbed: true,
  dynamicMapping: true,
};

export async function ensureWebIndex(
  engineUrl: string,
  indexName: string,
  apiKey?: string,
): Promise<{ created: boolean }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const get = await fetch(`${engineUrl}/v1/indexes/${encodeURIComponent(indexName)}`, { headers });
  if (get.ok) return { created: false };
  const create = await fetch(`${engineUrl}/v1/indexes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: indexName, mappings: WEB_MAPPINGS, settings: WEB_SETTINGS }),
  });
  if (!create.ok && create.status !== 409) {
    const j = (await create.json().catch(() => ({}))) as { message?: string };
    throw new Error(j.message || `Could not create index "${indexName}" (HTTP ${create.status}).`);
  }
  return { created: true };
}
