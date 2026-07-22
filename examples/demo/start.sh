#!/usr/bin/env bash
# Anvesh demo rehearsal — prefer `npm run stack` then `npm run demo:seed`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Anvesh demo"
echo ""
echo "  1) npm run build"
echo "  2) npm run setup -- init && set -a; source .env.anvesh; set +a"
echo "  3) npm run stack"
echo "  4) npm run demo:seed"
echo "  5) Open http://127.0.0.1:3849 → Search → index \"demo\""
echo ""
echo "Hybrid search (plain text, local embeddings):"
echo "  curl -s http://127.0.0.1:3848/v1/indexes/demo/search \\"
echo "    -H 'content-type: application/json' \\"
echo "    -d '{\"q\":\"lightweight search\",\"mode\":\"hybrid\"}'"
echo ""
