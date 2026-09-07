## The local copy's "left out" stub has a way back, and the card says so

- Festival-machine gap (`docs/testing/FESTIVAL_MACHINE_2026-09-06.md`): on a `di` install
  the front room's WCC and algovrithm doors landed on one sentence with no way back, and
  their two cards said LIVE over a black preview.
- The stub is a real component now, `src/works/HostedPieceStub.jsx`; the local profile in
  `vite.config.js` resolves every works-registry entry to that file instead of a virtual
  module (nothing imports it, so the hosted build never carries it). It names the piece,
  says where it lives, and offers `← the spaces` (`/`) and `the {id} space in Studio`
  (`/{id}/studio`), both `target="_top"` so a card made live still leaves the card.
- Preview protocol grew one message next to `dii:preview-ready`: `dii:preview-stub`
  (`PREVIEW_STUB_MESSAGE`, `signalPreviewStub` in `src/utils/previewMode.js`). The stub
  posts it under `?preview=1`; `SpaceCardPreview` frees the boot slot on it, drops the
  frame, and draws "not in this copy — this piece lives on di-studio.xyz" in the same
  frame the empty sandbox uses. No other card changes.
- Keeper window: the endpoint placeholder and the setup line name both boxes
  (llama.cpp/LM Studio at :8090, Ollama at :11434, both chat paths tried).
- Wiki: "Chat with Claude" summary and cost bullet cover the local Claude and the model on
  the box; the Keeper entry says which host is which; new entry `the-toybox` for
  `/{space}/make/{project}`.
- Second pass: CI's `copyVocabulary.test.js` refused the first toybox entry — five
  strings said `Raw` and one said `lane`. Now "the node editor" and "an address", per
  `docs/ai/vocabulary.md`; the route `/{space}/raw/projects/{project}` stays, it is an
  identifier.
- Verified: vitest on `copyVocabulary.test.js`, `HostedPieceStub.test.jsx`,
  `previewMode.test.js`, `SpaceHub.test.jsx`, `KeeperPanelWindow.test.jsx`,
  `WikiPage.test.jsx`, `nodeLabelVocabulary.test.js`, `packProfile.test.js`,
  `works/boundary.test.js`; `DI_PROFILE=local npm run build` green and under the
  15 MB budget; the built dist served by a scratch serverXR (`DI_LOCAL=1`, spare port)
  and screenshots of `/wcc`, `/algovrithm/scene` on a phone, the `/` grid, a wcc card
  made live, and the wiki entry read. Trap: that scratch server needs
  `APP_BASE_PATH=/serverXR` (as `scripts/di/runner-node.mjs` sets it) — without it
  the API router also mounts at `/` and its monitor page shadows the SPA's front door.
