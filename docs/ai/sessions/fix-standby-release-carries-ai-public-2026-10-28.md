# fix: standby release carries docs/ai/public — 2026-10-28

## What changed

- scripts/standby/build-runtime.sh: the release root gains docs/ai/public and src/wiki/wikiContent.js at the Dockerfile's relative places (app/src is serverXR/src), as serverXR/Dockerfile lines 41-51 do.
- scripts/standby/build-runtime.test.js: a test guards both copies.

## Why

- dev.diiii.xyz answered 404 for /llms.txt and /ai/context while prod answered 200 (ledger N1409): the Mac builds the dev tier with this script, which mirrored the Dockerfile but skipped those two copies.

## Tested

- build-runtime.test.js: 4 passed. Not tested: a real Mac release; the next dev deploy is the check (curl dev/llms.txt → 200).

## Owed

- The Mac's ops/current copy of this script is installed by the standby route (mac-safe-change).
