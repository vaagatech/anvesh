/**
 * Quickstart example — library usage without HTTP.
 */
import { AnveshEngine, MemoryStorage, createLogger } from "../src/index.js";

async function main() {
  createLogger({ pretty: true });
  const engine = new AnveshEngine(new MemoryStorage());
  await engine.init();

  await engine.createIndex(
    "articles",
    {
      title: { type: "text" },
      body: { type: "text" },
      tags: { type: "keyword" },
    },
    { vectorDimensions: 4 },
  );

  await engine.indexDocument("articles", {
    id: "intro",
    fields: {
      title: "Welcome to Anvesh",
      body: "A lightweight search engine for serverless teams.",
      tags: "announcement",
    },
    vector: [0.9, 0.1, 0, 0],
  });

  const keyword = engine.search("articles", { q: "serverless search", highlight: true });
  console.log(keyword.message);
  console.log(keyword.hits);

  const semantic = engine.search("articles", {
    vector: [1, 0, 0, 0],
    mode: "semantic",
  });
  console.log(semantic.message);
  console.log(semantic.hits.map((h) => ({ id: h.id, score: h.score })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
