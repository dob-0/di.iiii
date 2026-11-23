#!/usr/bin/env bash
# Downloads the Roblox type definitions luau-lsp needs to type-check the engine code (src/server,
# src/client). Types only, no code. Pinned by scripts/roblox-types.env: one commit, one sha256.
# Lands in $HOME/tools/roblox-types (override: ROBLOX_TYPES_DIR). Undo: rm -r that directory.
# Usage: scripts/setup-types.sh [--dry-run]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=roblox-types.env
source scripts/roblox-types.env
FILE="globalTypes.None.d.luau"
DIR="${ROBLOX_TYPES_DIR:-$HOME/tools/roblox-types}"
URL="https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/$ROBLOX_TYPES_COMMIT/scripts/$FILE"
echo "source: $URL"
echo "target: $DIR/$FILE"
if [[ "${1:-}" == "--dry-run" ]]; then echo "dry run: nothing downloaded"; exit 0; fi
mkdir -p "$DIR"
tmp="$(mktemp -d -p "$DIR")"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --max-time 120 -o "$tmp/$FILE" "$URL"
echo "$ROBLOX_TYPES_SHA256  $tmp/$FILE" | sha256sum -c -
install -m 0644 "$tmp/$FILE" "$DIR/$FILE"
echo "ok: $DIR/$FILE"
