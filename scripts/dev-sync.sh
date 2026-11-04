#!/bin/bash
# dev-sync.sh — local → dev for ONE space: the owner's flow "work on local, push to dev, sync all in dev, then main" (2026-11-02).
#   scripts/dev-sync.sh <space>            dry-run: lists exactly which projects would be written (writes nothing)
#   scripts/dev-sync.sh <space> --apply    does it, then reads dev back and compares project count + versions
# Uses the `di login` session (scripts/stored-login.mjs). If dev's public name is down (the Mac tunnel-guard holds it
# while the Pi serves prod) it reaches the Mac's dev server through its own ssh forward (DI_DEV_BASE), closed on exit.
# Never --skip by bare project id (refused); pass SKIP="space/project,..." in the environment instead.
set -u
SPACE="${1:?usage: dev-sync.sh <space> [--apply]}"; MODE="${2:-}"
cd "$(dirname "$0")/.." || exit 1
LOCAL_API_URL="${LOCAL_API_URL:-http://diiii.localhost}"
API_TOKEN="${API_TOKEN:-$(grep '^ADMIN_API_TOKEN=' "$HOME/.di/di.env" 2>/dev/null | cut -d= -f2-)}"
export LOCAL_API_URL API_TOKEN
FWD=""
cleanup() { [ -n "$FWD" ] && kill "$FWD" 2>/dev/null; }
trap cleanup EXIT
if [ -z "${DI_DEV_BASE:-}" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://dev.diiii.xyz/serverXR/api/health)" != 200 ]; then
  echo "dev-sync: dev's public name is down; using an ssh forward to the Mac's dev server (:8081)"
  ssh -o ConnectTimeout=10 -o BatchMode=yes -o ExitOnForwardFailure=yes -f -N -L 127.0.0.1:18081:127.0.0.1:8081 di-mac || { echo "dev-sync: forward failed"; exit 2; }
  FWD=$(ss -ltnp 2>/dev/null | grep ':18081 ' | sed 's/.*pid=\([0-9]*\).*/\1/' | head -1)
  export DI_DEV_BASE=http://127.0.0.1:18081/serverXR
fi
ARGS=(--from local --to dev --space "$SPACE"); [ -n "${SKIP:-}" ] && ARGS+=(--skip "$SKIP")
if [ "$MODE" = "--apply" ]; then node scripts/tier-sync.mjs "${ARGS[@]}"; rc=$?; else node scripts/tier-sync.mjs "${ARGS[@]}" --dry-run; rc=$?; fi
exit $rc
