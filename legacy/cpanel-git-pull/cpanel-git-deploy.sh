#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

CURRENT_BRANCH="${CPANEL_DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
DEPLOY_ENV="${1:-${CPANEL_DEPLOY_ENV:-}}"

if [[ -z "${DEPLOY_ENV}" ]]; then
  case "${CURRENT_BRANCH}" in
    dev)
      DEPLOY_ENV="staging"
      ;;
    main|master)
      DEPLOY_ENV="production"
      ;;
    *)
      echo "[cpanel-deploy] Unable to infer deploy environment from branch '${CURRENT_BRANCH}'." >&2
      echo "[cpanel-deploy] Pass 'staging' or 'production' as the first argument, or set CPANEL_DEPLOY_ENV." >&2
      exit 1
      ;;
  esac
fi

case "${DEPLOY_ENV}" in
  staging)
    DEFAULT_WEB_ROOT="${HOME}/staging.di-studio.xyz"
    DEFAULT_SERVERXR_ROOT="${HOME}/serverXR-staging"
    DEFAULT_SHARED_ROOT="${HOME}/shared-staging"
    DEFAULT_BASE_URL="https://staging.di-studio.xyz"
    DEFAULT_PORT="4001"
    DEFAULT_CORS="https://staging.di-studio.xyz"
    ;;
  production)
    DEFAULT_WEB_ROOT="${HOME}/public_html"
    DEFAULT_SERVERXR_ROOT="${HOME}/serverXR"
    DEFAULT_SHARED_ROOT="${HOME}/shared"
    DEFAULT_BASE_URL="https://di-studio.xyz"
    DEFAULT_PORT="4000"
    DEFAULT_CORS="https://di-studio.xyz,https://www.di-studio.xyz"
    ;;
  *)
    echo "[cpanel-deploy] Unsupported environment '${DEPLOY_ENV}'." >&2
    exit 1
    ;;
esac

DEPLOY_CONFIG_FILE="${CPANEL_DEPLOY_CONFIG_FILE:-${HOME}/.config/dii/${DEPLOY_ENV}.deploy.env}"

if [[ ! -f "${DEPLOY_CONFIG_FILE}" ]]; then
  echo "[cpanel-deploy] Missing deploy config: ${DEPLOY_CONFIG_FILE}" >&2
  echo "[cpanel-deploy] Create it from deploy/cpanel/cpanel.deploy.env.example and keep it only on the server." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${DEPLOY_CONFIG_FILE}"
set +a

CPANEL_WEB_ROOT="${CPANEL_WEB_ROOT:-${DEFAULT_WEB_ROOT}}"
CPANEL_SERVERXR_ROOT="${CPANEL_SERVERXR_ROOT:-${DEFAULT_SERVERXR_ROOT}}"
CPANEL_SHARED_ROOT="${CPANEL_SHARED_ROOT:-${DEFAULT_SHARED_ROOT}}"
CPANEL_SMOKE_BASE_URL="${CPANEL_SMOKE_BASE_URL:-${DEFAULT_BASE_URL}}"
PORT="${PORT:-${DEFAULT_PORT}}"
APP_BASE_PATH="${APP_BASE_PATH:-/serverXR}"
DATA_ROOT="${DATA_ROOT:-${CPANEL_SERVERXR_ROOT}/data}"
CORS_ORIGINS="${CORS_ORIGINS:-${DEFAULT_CORS}}"
NODE_ENV="${NODE_ENV:-production}"
REQUIRE_AUTH="${REQUIRE_AUTH:-true}"
MAX_UPLOAD_MB="${MAX_UPLOAD_MB:-100}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-/serverXR}"
CHECKPOINT_DIR="${CPANEL_CHECKPOINT_DIR:-${HOME}/deploy-checkpoints/${DEPLOY_ENV}}"
BACKUP_DIR="${CPANEL_BACKUP_DIR:-${HOME}/deploy-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_DIR}/${TIMESTAMP}-${DEPLOY_ENV}"

required_vars=(
  API_TOKEN
)

for key in "${required_vars[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "[cpanel-deploy] Missing required variable '${key}' in ${DEPLOY_CONFIG_FILE}." >&2
    exit 1
  fi
done

mkdir -p "${CPANEL_WEB_ROOT}" "${CPANEL_SERVERXR_ROOT}" "${CPANEL_SHARED_ROOT}" "${DATA_ROOT}" "${CHECKPOINT_DIR}" "${BACKUP_ROOT}"

echo "[cpanel-deploy] Environment: ${DEPLOY_ENV}"
echo "[cpanel-deploy] Branch: ${CURRENT_BRANCH}"
echo "[cpanel-deploy] Repo: ${REPO_ROOT}"
echo "[cpanel-deploy] Web root: ${CPANEL_WEB_ROOT}"
echo "[cpanel-deploy] Backend root: ${CPANEL_SERVERXR_ROOT}"

npm ci
if [[ -f "serverXR/package-lock.json" ]]; then
  npm --prefix serverXR ci
else
  npm --prefix serverXR install
fi

if [[ "${CPANEL_RUN_TESTS:-1}" == "1" ]]; then
  npm test
fi

node scripts/stage-cpanel-nodeapp-release.mjs

node scripts/write-server-env.mjs --output .deploy/cpanel/serverXR/.env.generated

if [[ "${CPANEL_SKIP_BACKUP:-0}" != "1" ]]; then
  if [[ -d "${CPANEL_WEB_ROOT}" ]]; then
    tar -czf "${BACKUP_ROOT}/web-root.tar.gz" \
      --exclude='cgi-bin' \
      --exclude='.well-known' \
      -C "${CPANEL_WEB_ROOT}" . || true
  fi

  if [[ -d "${CPANEL_SERVERXR_ROOT}" ]]; then
    tar -czf "${BACKUP_ROOT}/serverXR.tar.gz" -C "${CPANEL_SERVERXR_ROOT}" . || true
  fi

  if [[ -d "${CPANEL_SHARED_ROOT}" ]]; then
    tar -czf "${BACKUP_ROOT}/shared.tar.gz" -C "${CPANEL_SHARED_ROOT}" . || true
  fi
fi

if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude='cgi-bin' \
    --exclude='.well-known' \
    --exclude='.htaccess' \
    --exclude='serverXR' \
    .deploy/cpanel/public_html/ "${CPANEL_WEB_ROOT}/"

  rsync -az --delete \
    --exclude='.env' \
    --exclude='.env.generated' \
    --exclude='data' \
    --exclude='node_modules' \
    .deploy/cpanel/serverXR/ "${CPANEL_SERVERXR_ROOT}/"

  rsync -az --delete \
    .deploy/cpanel/shared/ "${CPANEL_SHARED_ROOT}/"
else
  echo "[cpanel-deploy] rsync is required on the server." >&2
  exit 1
fi

mkdir -p "${CPANEL_WEB_ROOT}/serverXR"
if [[ ! -f "${CPANEL_WEB_ROOT}/serverXR/.htaccess" ]]; then
  : > "${CPANEL_WEB_ROOT}/serverXR/.htaccess"
fi
cp .deploy/cpanel/serverXR/.env.generated "${CPANEL_SERVERXR_ROOT}/.env"

(
  cd "${CPANEL_SERVERXR_ROOT}"
  npm install --omit=dev
)

if [[ "${CPANEL_SKIP_RESTART:-0}" == "1" ]]; then
  echo "[cpanel-deploy] Skipping Node.js App restart because CPANEL_SKIP_RESTART=1."
elif command -v cloudlinux-selector >/dev/null 2>&1; then
  APP_ROOT_REL="${CPANEL_SERVERXR_ROOT#${HOME}/}"
  if [[ "${APP_ROOT_REL}" == "${CPANEL_SERVERXR_ROOT}" ]]; then
    APP_ROOT_REL="${CPANEL_SERVERXR_ROOT#/home/$(whoami)/}"
  fi
  cloudlinux-selector restart --json --interpreter nodejs --user "$(whoami)" --app-root "${APP_ROOT_REL}"
else
  echo "[cpanel-deploy] cloudlinux-selector not found. Restart the Node.js App manually in cPanel." >&2
fi

SMOKE_OUTPUT=".deploy/checkpoints/${DEPLOY_ENV}-smoke.json"
CHECKPOINT_NOTE="cPanel Git deploy from ${CURRENT_BRANCH}"

if [[ "${CPANEL_SKIP_SMOKE:-0}" == "1" ]]; then
  echo '{"success":true,"checks":[],"skipped":true}' > "${SMOKE_OUTPUT}"
else
  node scripts/smoke-check-cpanel.mjs --base-url "${CPANEL_SMOKE_BASE_URL}" --output "${SMOKE_OUTPUT}"
fi

node scripts/create-checkpoint.mjs \
  --environment "${DEPLOY_ENV}" \
  --release ".deploy/cpanel/release.json" \
  --smoke "${SMOKE_OUTPUT}" \
  --output-dir "${CHECKPOINT_DIR}" \
  --note "${CHECKPOINT_NOTE}"

echo "[cpanel-deploy] Completed successfully."
