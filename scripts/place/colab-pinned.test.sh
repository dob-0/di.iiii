#!/usr/bin/env bash
# Guard for colab-pinned.sh: a stand-in "uvx" that spins must stay under 25 % of one core.
# Linux with a systemd user session only; elsewhere it says so and passes as skipped.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
case "$(systemctl --user is-system-running 2>/dev/null || true)" in running|degraded) ;; *) echo "skip: no systemd user session"; exit 0;; esac
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
printf '#!/bin/bash\nend=$((SECONDS+5)); while [ $SECONDS -lt $end ]; do :; done\n' > "$T/uvx"; chmod +x "$T/uvx"
PATH="$T:$PATH" "$HERE/colab-pinned.sh" exec x & sleep 1
P="$(pgrep -n -f "$T/uvx")"; HZ="$(getconf CLK_TCK)"
a="$(awk '{print $14+$15}' "/proc/$P/stat")"; sleep 3; b="$(awk '{print $14+$15}' "/proc/$P/stat")"; wait
pct=$(( (b - a) * 100 / (3 * HZ) ))
[ "$pct" -le 25 ] || { echo "FAIL: the waiting client used ${pct} % of a core (cap 15 %)"; exit 1; }
echo "ok: the waiting client used ${pct} % of a core"
