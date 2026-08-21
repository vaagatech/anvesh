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
} as const;

export const WEB_SETTINGS = {
  vectorDimensions: 384,
  autoEmbed: true,
  dynamicMapping: true,
} as const;

/** Empty schema — engine learns fields on ingest when dynamicMapping is on. */
export const WEB_MAPPINGS_JSON = "{}";

/** Optional seed if you want preferred web field types up front. */
export const WEB_SEED_MAPPINGS_JSON = JSON.stringify(WEB_MAPPINGS, null, 2);
