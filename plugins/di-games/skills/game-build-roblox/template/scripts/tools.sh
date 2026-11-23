#!/usr/bin/env bash
# Runs ONE tool with Rokit's bin first on PATH, for this command only. Edits no profile.
# Example: scripts/tools.sh stylua --check src
set -euo pipefail
export ROKIT_ROOT="${ROKIT_ROOT:-$HOME/tools/rokit}"
if [[ $# -eq 0 ]]; then echo "usage: scripts/tools.sh <tool> [args...]" >&2; exit 2; fi
if [[ ! -d "$ROKIT_ROOT/bin" ]]; then echo "tools.sh: $ROKIT_ROOT/bin missing; run scripts/setup-tools.sh first" >&2; exit 1; fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PATH="$ROKIT_ROOT/bin:$PATH" exec "$@"
