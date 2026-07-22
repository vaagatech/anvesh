#!/usr/bin/env bash
# Stop the Anvesh local stack started by scripts/start.sh / npm start.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run setup -- down
