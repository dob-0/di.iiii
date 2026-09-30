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
# the thresholds must be whole numbers: `[ "95C" -ge ... ]` errors, and an error in an `if` test is just "false" (review B6-3)
case "$HOT$COOL$CPUS" in *[!0-9]*|"") echo "--pause-at, --resume-at and --cpus must be whole numbers" >&2; exit 2;; esac

cd "$(dirname "$0")/../.."
temp() { sensors 2>/dev/null | awk '/Package id 0/ { sub(/^\+/, "", $4); sub(/°C.*/, "", $4); print int($4); exit }'; }

# no reading, no guard — refuse before starting rather than run unwatched on a machine that hard-locks (review B6-3)
T0=$(temp)
case "$T0" in ""|*[!0-9]*) echo "no CPU package temperature could be read (sensors shows no 'Package id 0'); refusing to build unwatched" >&2; exit 1;; esac

PGFILE=$(mktemp)
# a new session, so the process group is the build and nothing else; its leader's pid is the group id
setsid sh -c 'echo $$ > "$1"; exec nice -n 19 taskset -c "$2" npm run di:pack -- --version="$3"' sh "$PGFILE" "$CPUS" "$VERSION" &
PID=$!
# the group id is written by the child; wait for it (up to 20 s) instead of assuming 1 s is enough (review B6-2a)
PGID=""; N=0
while [ -z "$PGID" ] && [ "$N" -lt 40 ]; do PGID=$(cat "$PGFILE" 2>/dev/null || true); [ -n "$PGID" ] || { sleep 0.5; N=$((N + 1)); }; done
[ -n "$PGID" ] || { echo "the build did not report its process group; stopping it" >&2; kill "$PID" 2>/dev/null || true; rm -f "$PGFILE"; exit 1; }
# Ctrl-C, a closed terminal or any exit must never leave the build SIGSTOPped, and a killed watcher must not leave it running unwatched (review B6-2c)
trap 'kill -CONT -- "-$PGID" 2>/dev/null || true; kill -TERM -- "-$PGID" 2>/dev/null || true; rm -f "$PGFILE"; exit 130' INT TERM HUP
echo "$(date +%H:%M:%S) packing $VERSION (group $PGID, cpu $CPUS); pause at ${HOT} °C, resume at ${COOL} °C"

STATE=run
while kill -0 "$PID" 2>/dev/null; do
    T=$(temp)
    case "$T" in
        ""|*[!0-9]*)
            # the sensor stopped answering: fail safe — pause, and say so; resume when it answers and is cool
            if [ "$STATE" = run ]; then kill -STOP -- "-$PGID" 2>/dev/null || true; STATE=paused; echo "$(date +%H:%M:%S) temperature unreadable: paused"; fi;;
        *)
            # a group that ended between the check and the signal is not an error (review B6-2b)
            if [ "$STATE" = run ] && [ "$T" -ge "$HOT" ]; then kill -STOP -- "-$PGID" 2>/dev/null || true; STATE=paused; echo "$(date +%H:%M:%S) ${T} °C: paused"; fi
            if [ "$STATE" = paused ] && [ "$T" -le "$COOL" ]; then kill -CONT -- "-$PGID" 2>/dev/null || true; STATE=run; echo "$(date +%H:%M:%S) ${T} °C: resumed"; fi;;
    esac
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
