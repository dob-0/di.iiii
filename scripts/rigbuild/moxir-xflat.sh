#!/bin/sh
# moxir-xflat.sh — MOXIR's candidate "Minimal · X lying down" onto a di.iiii install, in its own
# projects beside Minimal (RIG_BUILD.md §15.8). Never touches moxir-hall-minimal, another
# candidate's project, the hall's own project (load-version --no-mark-from) or the light desk.
#
#   API=https://local.thedi.studio/serverXR sh scripts/rigbuild/moxir-xflat.sh <step> [fixed|heads]
#     report    versions.mjs --report into $REPORT (offline: hung, typed, patched on a throwaway desk)
#     version   load-version.mjs: the project moxir-hall-minimal-xflat[-heads] — the hall copied from
#               moxir-hall, the rig as pieces and lamps, the equipment list, the looks, the rigVariant
#     hallshow  the version's hall without the planning floor tape (hall-show.mjs)
#     opening   rig.mjs --night-only: the night and the opening shot
#     show      show-loop.mjs --doc-only: the cue list + loop in the DOCUMENT (the desk is never asked)
#     clock     show-clock.mjs --epoch now: the show's clock (plays where no desk answers, §16)
#     look L    load-version --look L --nominal (the document rests on look L, every lamp nominal)
#     all       report, version, hallshow, opening, show, clock, look <default>
#     render    photograph every look from $CAMERAS on the GPU (see the step)
#     undo      DELETE the candidate's project (only it) — the space's other projects are untouched
# A `di save moxir` goes into $STEPS before every write. A whole-space `di open` of such a save would
# ALSO roll back what other sessions changed since — undo deletes this project instead.
set -eu
REPO=$(cd "$(dirname "$0")/../.." && pwd)
API=${API:?API=<install>/serverXR}
TOKEN=${TOKEN:-$HOME/.di/di.env}
HALL=${HALL:-/mnt/data/footage/place-moxir-hall-v3-crane-dj/hall.json}
REPORT=${REPORT:-$HOME/di-backups/preview-rig-builder-2026-09-28/xflat-report}
STEPS=${STEPS:-$HOME/di-backups/preview-rig-builder-2026-09-28/steps}
DI=${DI:-$HOME/.local/bin/di}
step=${1:-}
which=${2:-fixed}
case "$which" in
    fixed) V=minimal-xflat ;;
    heads) V=minimal-xflat-heads ;;
    *) echo "which: fixed | heads" >&2; exit 2 ;;
esac
P=moxir-hall-$V
RIG=scripts/place/rigs/moxir-2026-10-17-$V.json
say() { printf '[xflat %s] %s\n' "$V" "$*"; }
save() {
    d="$STEPS/$(date +%Y%m%d-%H%M%S)-xflat-$1"
    mkdir -p "$d"
    (cd "$d" && "$DI" save moxir >/dev/null && mv moxir.diiii "moxir-before-$1.diiii" && sha256sum "moxir-before-$1.diiii" > SHA256SUMS)
    say "backup: $d"
}
cd "$REPO"
[ -f "$HALL" ] || { echo "no hall.json at $HALL" >&2; exit 1; }
lv() { node scripts/rigbuild/load-version.mjs --api "$API" --space moxir --from moxir-hall --version "$V" --hall "$HALL" --token-file "$TOKEN" --no-mark-from "$@"; }
run() {
    case "$1" in
        report) node scripts/rigbuild/versions.mjs --report "$REPORT" --hall "$HALL" ;;
        version) save "version-$V"; lv --report "$REPORT" ${FORCE:+--force} ;;
        hallshow) save "hallshow-$V"; node scripts/place/hall-show.mjs --in "${HALL%/hall.json}/hall.glb" --out "$REPORT/hall-show.glb" --api "$API" --project "$P" --token-file "$TOKEN" ;;
        opening) save "opening-$V"; node scripts/place/rig.mjs --api "$API" --rig "$RIG" --hall "$HALL" --project "$P" --night-only --token-file "$TOKEN" ;;
        show) save "show-$V"; node scripts/rigbuild/show-loop.mjs --api "$API" --project "$P" --show "scripts/rigbuild/shows/moxir-${V#minimal-}.json" --token-file "$TOKEN" --doc-only ;;
        clock) save "clock-$V"; node scripts/rigbuild/show-clock.mjs --api "$API" --project "$P" --epoch now --token-file "$TOKEN" ;;
        look) save "look-$3-$V"; lv --look "$3" --nominal ;;
        render) save "render-$V"
            # per look: the document shows the look (load-version --look), then rig-look photographs it
            # on the GPU (prime-run's PRIME offload, renderer checked) from $CAMERAS, with no desk and
            # no clock in the browser (--no-desk), one browser machine-wide ($LOCK), started only when
            # the CPU package is at or under $MAX_C. No token goes to the browser (the install's own).
            # Ends resting on the default look at nominal light.
            MAX_C=${MAX_C:-84}; LOCK=${LOCK:?LOCK=<the shared browser lock>}; OUT=${OUT:?OUT=<dir>}
            CAMERAS=${CAMERAS:?CAMERAS=<cameras.json>}; VIEWS=${VIEWS:?VIEWS=<names in CAMERAS>}
            for L in ${LOOKS:-one-beam slow-sweep red-room white-cathedral strobe-hit}; do
                lv --look "$L"
                while t=$(sensors 2>/dev/null | awk '/^Package id 0:/ { gsub(/[+°C]/, "", $4); print int($4) }'); [ -n "$t" ] && [ "$t" -gt "$MAX_C" ]; do
                    say "CPU package ${t} C > ${MAX_C} C — waiting"; sleep 20; done
                flock "$LOCK" node scripts/place/rig-look.mjs --gpu --no-desk --base "${API%/serverXR}" --space moxir --project "$P" --path "/moxir/p/$P" \
                    --hall "$HALL" --rig "$RIG" --look "$L" --out "$OUT" --tag "$which-$L" --cameras "$CAMERAS" --views "$VIEWS" \
                    --size "${SIZE:-1600x900}" --seconds 2 --settle "${SETTLE:-14}" --max-cpu-c 90
            done
            lv --look "$(node -e "console.log(require('./$RIG').defaultLook)")" --nominal ;;
        undo) save "undo-$V"
            T=$(grep '^ADMIN_API_TOKEN=' "$TOKEN" | cut -d= -f2-)
            curl -fsS -X DELETE -H "Authorization: Bearer $T" "$API/api/projects/$P" | head -c 300; echo; say "deleted $P" ;;
        *) echo "usage: $0 report|version|hallshow|opening|show|clock|look <L>|render|all|undo [fixed|heads]" >&2; exit 2 ;;
    esac
}
if [ "$step" = all ]; then
    for s in report version hallshow opening show clock; do run "$s"; done
    run look "$which" "$(node -e "console.log(require('./$RIG').defaultLook)")"
else
    run "$step" "$which" "${3:-}"
fi
