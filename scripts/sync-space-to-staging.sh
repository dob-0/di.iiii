#!/usr/bin/env bash
# sync-space-to-staging.sh — copy one or more spaces from the production
# server to the staging server on the VPS, using scripts/space-bundle.mjs
# (export/import) under the hood. Run this ON THE VPS (or via
# `ssh dii-vps 'bash -s' < scripts/sync-space-to-staging.sh -- <ids...>`).
#
# Why this exists: staging's database starts empty and is never
# automatically kept in sync with prod's real content — see the
# "Access restricted" entry in docs/ai/known-fixes.md (2026-07-16) for the
# full story. This wraps the manual docker cp / docker exec dance from that
# incident into one repeatable command so re-syncing a space (or grabbing a
# newly created one) doesn't need to be re-derived each time.
#
# Usage:
#   ./sync-space-to-staging.sh wcc br-id-ge beyond-form
#   ./sync-space-to-staging.sh --force wcc      # overwrite if already on staging
#
# Space ids use hyphens, not underscores (br-id-ge, not br_id_ge — that's
# the display name, not the space id — see GET /api/spaces to confirm).

set -euo pipefail

PROD_CONTAINER=dii-server-1
STAGING_CONTAINER=dii-staging-server-1
SCRIPT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/space-bundle.mjs"
FORCE=""

args=()
for a in "$@"; do
  if [ "$a" = "--force" ]; then FORCE="--force"; else args+=("$a"); fi
done
set -- "${args[@]}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 [--force] <space-id> [space-id...]" >&2
  exit 1
fi

if [ ! -f "$SCRIPT_SRC" ]; then
  echo "error: space-bundle.mjs not found next to this script ($SCRIPT_SRC)" >&2
  echo "copy scripts/space-bundle.mjs alongside this script, or run from a checkout of the repo" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "== copying space-bundle.mjs into both containers =="
docker cp "$SCRIPT_SRC" "$PROD_CONTAINER":/tmp/space-bundle.mjs
docker cp "$SCRIPT_SRC" "$STAGING_CONTAINER":/tmp/space-bundle.mjs
# import needs ../serverXR/src/db.js relative to its own path; the image
# flattens serverXR/src -> /app/src, so make that resolve via a symlink.
docker exec -u root "$STAGING_CONTAINER" mkdir -p /app/scripts
docker exec -u root "$STAGING_CONTAINER" cp /tmp/space-bundle.mjs /app/scripts/space-bundle.mjs
docker exec -u root "$STAGING_CONTAINER" ln -sfn /app /app/serverXR

for id in "$@"; do
  echo "== exporting '$id' from prod (read-only) =="
  docker exec "$PROD_CONTAINER" node /tmp/space-bundle.mjs export "$id" --data-root /data --out "/tmp/$id.space-bundle.tar.gz"

  echo "== copying bundle to staging =="
  docker cp "$PROD_CONTAINER":"/tmp/$id.space-bundle.tar.gz" "$TMP/$id.space-bundle.tar.gz"
  docker cp "$TMP/$id.space-bundle.tar.gz" "$STAGING_CONTAINER":"/tmp/$id.space-bundle.tar.gz"

  echo "== importing '$id' into staging =="
  docker exec -u root "$STAGING_CONTAINER" node /app/scripts/space-bundle.mjs import "/tmp/$id.space-bundle.tar.gz" --data-root /data $FORCE

  docker exec "$PROD_CONTAINER" rm -f "/tmp/$id.space-bundle.tar.gz"
  docker exec -u root "$STAGING_CONTAINER" rm -f "/tmp/$id.space-bundle.tar.gz"
done

echo "== cleanup =="
docker exec -u root "$PROD_CONTAINER" rm -f /tmp/space-bundle.mjs
docker exec -u root "$STAGING_CONTAINER" sh -c 'rm -f /app/scripts/space-bundle.mjs /app/serverXR /tmp/space-bundle.mjs'

echo "done: synced $* to staging"
