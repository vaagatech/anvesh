#!/usr/bin/env bash
# Start the full Anvesh local stack (engine + hub + spider + indexer).
# Usage: npm start   |   bash scripts/start.sh [--seed] [--no-build]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SEED=0
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    --no-build) NO_BUILD=1 ;;
    -h|--help)
      echo "Usage: bash scripts/start.sh [--seed] [--no-build]"
      echo "  --seed      seed demo index after stack is up"
      echo "  --no-build  skip npm run build even if dist is missing"
      exit 0
      ;;
  esac
done

need_install=0
if [[ ! -d node_modules ]]; then
  need_install=1
elif [[ ! -d apps/engine/node_modules ]] && [[ ! -f apps/engine/package.json ]]; then
  need_install=1
fi

if [[ "$need_install" -eq 1 ]]; then
  echo "→ npm install"
  npm install
fi

need_build=0
for p in \
  apps/engine/dist/cli.js \
  apps/hub/dist/server/cli.js \
  apps/spider/dist/cli.js \
  apps/indexer/dist/cli.js \
  apps/setup/dist/cli.js
do
  if [[ ! -f "$p" ]]; then
    need_build=1
    break
  fi
done

if [[ "$NO_BUILD" -eq 0 && "$need_build" -eq 1 ]]; then
  echo "→ npm run build"
  npm run build
elif [[ "$NO_BUILD" -eq 0 && "$need_build" -eq 0 ]]; then
  echo "→ build artifacts present (skip rebuild)"
fi

if [[ ! -f .env.anvesh ]]; then
  echo "→ anvesh-setup init"
  npm run setup -- init
fi

set -a
# shellcheck disable=SC1091
source .env.anvesh
set +a

echo "→ starting stack"
npm run setup -- up

if [[ "$SEED" -eq 1 ]]; then
  echo "→ seeding demo index"
  npm run demo:seed
fi

HUB_PORT="${ANVESH_HUB_PORT:-3849}"
USER_NAME="${ANVESH_HUB_ADMIN_USER:-admin}"

echo ""
echo "Anvesh is ready."
echo "  Hub   http://127.0.0.1:${HUB_PORT}"
echo "  Login ${USER_NAME} (password in .env.anvesh)"
echo "  Stop  npm run stop"
echo ""
