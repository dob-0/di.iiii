#!/bin/sh
# pack-preview.sh — build a preview artifact on THIS machine without cooking it.
#
# aylmo's CPU package sits at 92-100 °C under a full build (its cooler is the fault; it has hard-locked
# twice under load). This runs `npm run di:pack` on one core at the lowest priority and PAUSES the whole
# build (SIGSTOP on its process group) while the package is at or above --pause-at, resuming it (SIGCONT)
# once it is at or below --resume-at. A build that ends while paused is resumed first, never left stopped.
#
#   sh scripts/rigbuild/pack-preview.sh 0.4.16-rigbuilder.13 [--pause-at 95] [--resume-at 85] [--cpus 0]
#
# Prints the artifact path and its sha256 on success. The artifact then goes in with preview-install.sh.
set -eu

[ $# -ge 1 ] || { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
VERSION=$1; shift
HOT=95; COOL=85; CPUS=0
while [ $# -gt 0 ]; do
    case "$1" in
        --pause-at) HOT=${2:-}; shift 2;;
        --resume-at) COOL=${2:-}; shift 2;;
        --cpus) CPUS=${2:-}; shift 2;;
        *) echo "unknown flag $1" >&2; exit 2;;
    esac
done
command -v sensors >/dev/null || { echo "sensors (lm_sensors) is needed to watch the temperature" >&2; exit 1; }

cd "$(dirname "$0")/../.."
temp() { sensors 2>/dev/null | awk '/Package id 0/ { sub(/^\+/, "", $4); sub(/°C.*/, "", $4); print int($4); exit }'; }

PGFILE=$(mktemp)
# a new session, so the process group is the build and nothing else; its leader's pid is the group id
setsid sh -c 'echo $$ > "$1"; exec nice -n 19 taskset -c "$2" npm run di:pack -- --version="$3"' sh "$PGFILE" "$CPUS" "$VERSION" &
PID=$!
sleep 1
PGID=$(cat "$PGFILE")
echo "$(date +%H:%M:%S) packing $VERSION (group $PGID, cpu $CPUS); pause at ${HOT} °C, resume at ${COOL} °C"

STATE=run
while kill -0 "$PID" 2>/dev/null; do
    T=$(temp)
    if [ -n "$T" ]; then
        if [ "$STATE" = run ] && [ "$T" -ge "$HOT" ]; then kill -STOP -- "-$PGID"; STATE=paused; echo "$(date +%H:%M:%S) ${T} °C: paused"; fi
        if [ "$STATE" = paused ] && [ "$T" -le "$COOL" ]; then kill -CONT -- "-$PGID"; STATE=run; echo "$(date +%H:%M:%S) ${T} °C: resumed"; fi
    fi
    sleep 5
done
[ "$STATE" = paused ] && kill -CONT -- "-$PGID" 2>/dev/null || true

RC=0; wait "$PID" || RC=$?
rm -f "$PGFILE"
[ "$RC" = 0 ] || { echo "$(date +%H:%M:%S) pack FAILED (exit $RC)" >&2; exit "$RC"; }
ART="dist-runtime/di-runtime-$VERSION.tar.gz"
[ -f "$ART" ] || { echo "no artifact at $ART" >&2; exit 1; }
echo "$(date +%H:%M:%S) done: $PWD/$ART"
sha256sum "$ART"
