#!/usr/bin/env bash
# Installs Rokit v1.2.0 (Linux x86_64) and then every tool in rokit.toml.
# Rokit home: ROKIT_ROOT (named in Rokit's source, lib/storage/home.rs); default $HOME/tools/rokit.
# This script NEVER edits ~/.bashrc or any shell profile. Run it again any time: it skips finished steps.
# After the install it records the sha256 of every tool binary in tools.sha256 (first install) or checks it
# (scripts/verify_tools.py --record). The first install trusts the GitHub release and the version pin.
# Use --dry-run to print the steps only.
set -euo pipefail

ROKIT_VERSION="v1.2.0"
ROKIT_ZIP="rokit-1.2.0-linux-x86_64.zip"
ROKIT_URL="https://github.com/rojo-rbx/rokit/releases/download/${ROKIT_VERSION}/${ROKIT_ZIP}"
# sha256 from the release JSON (api.github.com/repos/rojo-rbx/rokit/releases/tags/v1.2.0), read 2026-10-28
ROKIT_SHA256="951a7f3ec3d2a5e021fd1867d32f69f010ee4c2927f644b759578afc59c65fc0"
export ROKIT_ROOT="${ROKIT_ROOT:-$HOME/tools/rokit}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

step() { echo "==> $*"; }
run() { if [[ $DRY -eq 1 ]]; then echo "    (dry-run) $*"; else "$@"; fi; }

step "Rokit home: $ROKIT_ROOT"
run mkdir -p "$ROKIT_ROOT/bin"

if [[ -x "$ROKIT_ROOT/bin/rokit" ]]; then
  step "Rokit already there: $ROKIT_ROOT/bin/rokit"
else
  if [[ "$(uname -s)-$(uname -m)" != "Linux-x86_64" ]]; then
    echo "setup-tools.sh: only Linux x86_64 can download Rokit here so far (this is $(uname -s)-$(uname -m))." >&2
    echo "  Put Rokit in $ROKIT_ROOT/bin yourself, or add that platform's zip and sha256 above. Owed." >&2
    exit 1
  fi
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  step "Download $ROKIT_URL"
  run curl -fsSL -o "$TMP/$ROKIT_ZIP" "$ROKIT_URL"
  step "Check sha256 = $ROKIT_SHA256"
  if [[ $DRY -eq 1 ]]; then
    echo "    (dry-run) echo '$ROKIT_SHA256  $TMP/$ROKIT_ZIP' | sha256sum -c -"
  else
    echo "$ROKIT_SHA256  $TMP/$ROKIT_ZIP" | sha256sum -c -
  fi
  step "Unpack into $ROKIT_ROOT/bin"
  run unzip -o -q "$TMP/$ROKIT_ZIP" -d "$TMP/unpacked"
  run install -m 0755 "$TMP/unpacked/rokit" "$ROKIT_ROOT/bin/rokit"
fi

step "rokit install (every tool in rokit.toml; Rokit's own home is set by ROKIT_ROOT)"
# No 'rokit self-install': it edits shell profiles. The tools are run through scripts/tools.sh.
# --no-trust-check skips Rokit's own prompt about untrusted tools (meant for CI). The version is pinned in rokit.toml and
# the hash lock below takes the place of that check.
run bash -c "cd '$REPO' && PATH='$ROKIT_ROOT/bin':\"\$PATH\" '$ROKIT_ROOT/bin/rokit' install --no-trust-check"

step "tools.sha256: record each tool's hash at its first install, check it on every later run"
run python3 -I "$REPO/scripts/verify_tools.py" --record

step "Done. Run a tool with: scripts/tools.sh rojo --version"
