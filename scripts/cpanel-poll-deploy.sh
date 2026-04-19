#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

DEPLOY_ENV="${1:-}"
DRY_RUN="${2:-}"

if [[ -z "${DEPLOY_ENV}" ]]; then
  echo "[cpanel-poll] Usage: bash scripts/cpanel-poll-deploy.sh <staging|production> [--dry-run]" >&2
  exit 1
fi

case "${DEPLOY_ENV}" in
  staging)
    TARGET_BRANCH="cpanel-staging"
    ;;
  production)
    TARGET_BRANCH="cpanel-production"
    ;;
  *)
    echo "[cpanel-poll] Unsupported environment '${DEPLOY_ENV}'." >&2
    exit 1
    ;;
esac

run_or_echo() {
  if [[ "${DRY_RUN}" == "--dry-run" ]]; then
    echo "[dry-run] $*"
    return 0
  fi
  "$@"
}

cleanup_generated_files() {
  rm -f ".deploy/cpanel/serverXR/.env.generated"
  rm -f ".deploy/checkpoints/"*.json 2>/dev/null || true
}

if [[ "${DRY_RUN}" != "--dry-run" ]]; then
  STATUS_OUTPUT="$(git status --porcelain)"
  if [[ -n "${STATUS_OUTPUT}" ]]; then
    SAFE_STATUS="$(printf '%s\n' "${STATUS_OUTPUT}" | grep -Ev '^\?\? \.deploy/cpanel/serverXR/\.env\.generated$|^\?\? \.deploy/checkpoints/.*$' || true)"
    if [[ -n "${SAFE_STATUS}" ]]; then
      echo "[cpanel-poll] Refusing to auto-deploy with unexpected local changes:" >&2
      printf '%s\n' "${SAFE_STATUS}" >&2
      exit 1
    fi
    cleanup_generated_files
  fi
fi

run_or_echo git fetch origin "${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/${TARGET_BRANCH}")"

if [[ "${LOCAL_HEAD}" == "${REMOTE_HEAD}" ]]; then
  echo "[cpanel-poll] ${DEPLOY_ENV}: already up to date at ${LOCAL_HEAD:0:7}"
  exit 0
fi

echo "[cpanel-poll] ${DEPLOY_ENV}: updating ${LOCAL_HEAD:0:7} -> ${REMOTE_HEAD:0:7}"

if [[ "${DRY_RUN}" == "--dry-run" ]]; then
  echo "[dry-run] git branch backup-${TARGET_BRANCH}-before-auto-\$(date +%Y%m%d-%H%M%S)"
else
  git branch "backup-${TARGET_BRANCH}-before-auto-$(date +%Y%m%d-%H%M%S)" >/dev/null 2>&1 || true
fi

run_or_echo git reset --hard "origin/${TARGET_BRANCH}"
run_or_echo bash scripts/cpanel-apply-prebuilt-release.sh "${DEPLOY_ENV}"
