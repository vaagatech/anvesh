#!/usr/bin/env bash
# Commit current work on main and create a release tag from the synced package.json version.
# Tag format: vX.Y.Z  (each part 1–3 digits)
#
# Usage:
#   npm run release              # commit + tag (local)
#   npm run release -- --push    # also push main + tag to origin
#   npm run release -- --message "release: ship hub rbac"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUSH=0
MSG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    --message|-m)
      MSG="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: scripts/release.sh [--push] [--message \"...\"]"
      exit 1
      ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Release must run on main (current branch: $BRANCH)."
  exit 1
fi

# Keep every package.json (and internal workspace deps) on the root version.
node scripts/version.mjs sync
VERSION="$(node -p "require('./package.json').version")"
if [[ ! "$VERSION" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "Invalid package.json version: $VERSION (expected X.Y.Z with 1–3 digits per part)."
  exit 1
fi
TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Bump the version first (npm run version:bump)."
  exit 1
fi

if [[ -z "$MSG" ]]; then
  MSG="release: ${TAG}"
fi

# Stage everything for the release commit (versions + any pending work).
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit; creating tag ${TAG} on current HEAD."
else
  git commit -m "$MSG"
  echo "Committed: $MSG"
fi

git tag -a "$TAG" -m "Anvesh ${TAG}"
echo "Created tag ${TAG} (all packages at ${VERSION})."

if [[ "$PUSH" -eq 1 ]]; then
  git push origin main
  git push origin "$TAG"
  echo "Pushed main and ${TAG}. Publish workflow will run for the tag."
else
  echo
  echo "Next:"
  echo "  git push origin main"
  echo "  git push origin ${TAG}"
  echo "Or re-run: npm run release -- --push"
fi
