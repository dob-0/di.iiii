## 2026-11-12 — propose carries a file over 100 MB in parts

- `space-bundle.mjs propose` sends a file over 64 MB (`DI_PROPOSE_SINGLE_MAX_BYTES`) through the chunked-upload route with `kind: "proposal"`; finish runs `submitProposalFile` in serverXR/src/index.js, the same function the one-POST proposals route now calls.
- The parts client is shared with `di open --to` (scripts/di/partsUpload.mjs). A server that does not echo the kind is cancelled before any part is sent.
- Tests: bundleParts.test.js (kind proposal), scripts/space-proposal.test.js. Not tested: a real 843 MB file against a live server.
