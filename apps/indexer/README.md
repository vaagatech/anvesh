# Anvesh Indexer

Bulk-loads documents (including spider JSONL) into the Anvesh engine. Run as a separate Node process for heavy indexing.

```bash
# Local filesystem engine (same machine)
npm run start -w @vaagatech/anvesh-indexer -- --index web --input .anvesh/crawl/out.jsonl

# Remote engine API
npm run start -w @vaagatech/anvesh-indexer -- \
  --index web \
  --input .anvesh/crawl/out.jsonl \
  --engine-url http://127.0.0.1:3848 \
  --api-key "$ANVESH_API_KEY"
```

By VaagaTech — https://www.vaagatech.com
