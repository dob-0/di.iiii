#!/bin/sh
# versions-render.sh — photograph each rig version in its key looks, on the GPU, from the
# same cameras (the opening view and the crane photo's). docs/architecture/RIG_BUILD.md §15.
#
#   API=http://localhost:4411/serverXR BASE=http://localhost:5411 SPACE=mxver-moxir \
#   TOKEN_FILE=serverXR/.env.local OUT=~/Downloads/moxir-versions/shots \
#   LOCK=/path/to/browser.lock  sh scripts/rigbuild/versions-render.sh [minimal middle full]
#
# Per version and look: load-version.mjs --look (the look's aims, colours and levels from
# the rig file, and its wash), then rig-look.mjs --gpu (headed Chromium on the NVIDIA card,
# the renderer string checked, one browser at a time under $LOCK, waiting under 85 C and
# stopping a view over 95 C). Ends by putting each version back on its default look.
# Point it only at a stack you own (the looks are written as ops to $API).
# CAMERAS=<file> adds named views (rig-look --cameras); NO_DESK=1 renders the document as saved
# even where a light desk runs (rig-look --no-desk); MAX_C caps the CPU package before each view.
# The version rests at the end on its default look at NOMINAL light (a look rested at level 0
# never comes back — RIG_BUILD §15.6).
set -eu
: "${API:?API=<your stack>/serverXR}" "${BASE:?BASE=<your stack's page origin>}" "${SPACE:?SPACE=<space id>}" "${TOKEN_FILE:?TOKEN_FILE=<env file with ADMIN_API_TOKEN>}" "${OUT:?OUT=<dir>}"
FROM=${FROM:-moxir-hall}
HALL=${HALL:-scripts/place/rigs/moxir-hall-2026-09-28.hall.json}
LOOKS=${LOOKS:-white-cathedral red-room strobe-hit}
VIEWS=${VIEWS:-opening,crane}
SIZE=${SIZE:-1600x900}
LOCK=${LOCK:-/tmp/rig-browser.lock}
VERSIONS=${*:-minimal middle full}
mkdir -p "$OUT"
for v in $VERSIONS; do
    for look in $LOOKS; do
        node scripts/rigbuild/load-version.mjs --api "$API" --space "$SPACE" --from "$FROM" --version "$v" --hall "$HALL" --token-file "$TOKEN_FILE" --look "$look"
        flock "$LOCK" node scripts/place/rig-look.mjs --gpu --base "$BASE" --space "$SPACE" --project "$FROM-$v" --path "/$SPACE/p/$FROM-$v" \
            --hall "$HALL" --rig "scripts/place/rigs/moxir-2026-10-17-$v.json" --look "$look" --out "$OUT" --tag "$v-$look" \
            --views "$VIEWS" --size "$SIZE" --seconds ${SECONDS_FPS:-4} --settle ${SETTLE:-25} --token-file "$TOKEN_FILE" \
            ${CAMERAS:+--cameras "$CAMERAS"} ${NO_DESK:+--no-desk} --max-cpu-c ${MAX_C:-85}
    done
    node scripts/rigbuild/load-version.mjs --api "$API" --space "$SPACE" --from "$FROM" --version "$v" --hall "$HALL" --token-file "$TOKEN_FILE" \
        --look "$(node -e "console.log(require('./scripts/place/rigs/moxir-2026-10-17-$v.json').defaultLook)")" --nominal
done
