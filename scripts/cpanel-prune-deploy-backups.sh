#!/usr/bin/env bash
# Standalone safety net for ~/deploy-backups on the cPanel host.
#
# scripts/cpanel-apply-prebuilt-release.sh already prunes old backups to the
# newest N, but only as a side effect of a *successful* deploy. If deploys
# stop running for any reason (a broken pipeline, a disk-full chicken-and-egg
# deadlock — see docs/ai/known-fixes.md), nothing prunes and backups grow
# unbounded until the account quota is exhausted. Run this independently on
# a cron schedule so pruning never depends on deploys actually succeeding.
#
# Usage on the host: bash scripts/cpanel-prune-deploy-backups.sh
# Cron (daily at 03:00): 0 3 * * * /bin/bash /home/distudio/repositories/di.iiii-staging/scripts/cpanel-prune-deploy-backups.sh >> /home/distudio/logs/prune-deploy-backups.log 2>&1

set -euo pipefail

BACKUP_DIR="${CPANEL_BACKUP_DIR:-${HOME}/deploy-backups}"
KEEP_BACKUPS="${CPANEL_KEEP_BACKUPS:-3}"

[[ -d "${BACKUP_DIR}" ]] || { echo "[prune-deploy-backups] ${BACKUP_DIR} does not exist, nothing to do."; exit 0; }

prune_env() {
  local env="$1"
  local old_dirs
  old_dirs="$(find "${BACKUP_DIR}" -maxdepth 1 -mindepth 1 -type d -name "*-${env}" | sort | head -n "-${KEEP_BACKUPS}" 2>/dev/null || true)"
  [[ -z "${old_dirs}" ]] && { echo "[prune-deploy-backups] Nothing to prune for ${env}."; return 0; }
  echo "[prune-deploy-backups] Pruning old ${env} backups beyond the newest ${KEEP_BACKUPS}:"
  while IFS= read -r dir; do
    [[ -z "${dir}" ]] && continue
    echo "  rm -rf ${dir}"
    rm -rf "${dir}"
  done <<< "${old_dirs}"
}

prune_env staging
prune_env production

echo "[prune-deploy-backups] Done. Current size: $(du -sh "${BACKUP_DIR}" | cut -f1)"
