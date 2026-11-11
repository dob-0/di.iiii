# feat/deck-to-wall — the VJ deck's mix on the stage screen (2026-11-10)

## Spec
The VJ deck (`vj.deck`) mixes layers; its master reached only the small OUTPUT monitor in Perform. The stage page
`/{space}/map/{project}/out` must be able to show the deck's mix live, following every fader and clip change made in Perform,
with one camera opened once per page. Plus one command that launches the stage and the tool.

## What already existed
- A Projection surface already has the source kind `network` (label "Pictures", `ref` = a node id). `MapSourceView` ->
  `MapNetworkSource` runs the project's picture operators on the out page (`useTopNetwork({ show })`).
- `toTopNetwork` expands every deck into Clip In / Blend / Level operators and returns `alias { deckId: deckId::master }`.
- The inspector offered only `top.out` nodes; and a surface whose ref was a deck id showed "that Picture Out is gone", because the
  expanded network no longer contains the deck id.
- Deck state lives in `node.values.deck` of the shared document, so Perform edits reach the out page by the normal document sync.

## What was built
- `src/map/MapSourceView.jsx` `MapNetworkSource`: the ref is resolved through the network's `alias` (`resolveAlias`) -> the surface draws the deck master.
- `src/map/MapSurface.jsx` `pictureOutOptions`: also lists `vj.deck` nodes as "VJ Deck — name"; `MapInspector.jsx` words: "Picture Out or VJ Deck".
- `src/project/tops/cameraPool.js` (new): one device = one `getUserMedia` per page; later openers get a clone of the same capture; the device is
  released when the last one stops. Used by `MapCameraSource` (camera/stream surface) and by the camera-opening effect in `useTopNetwork.js`
  (ONE line changed there: `media.getUserMedia(` -> `openSharedCamera(media, `, plus the import). Script-opened cameras (`compiled.open`) are not pooled.
  Key = device id; "default camera" (no id) and an explicit id of the same device are two keys.
- `scripts/show/stage-open.sh`: one-command launch (see below).
- Tests: `src/map/MapSourceView.deck.test.jsx`, `src/project/tops/cameraPool.test.js`.

## How to use it (owner)
1. Projection desk -> click Surface 1 -> Source: **Pictures**.
2. Picture Out or VJ Deck: choose **VJ Deck — <name>**.
3. Open the stage page (or run the launch below); Perform changes show on the wall within a fraction of a second.
4. An empty deck is black, not an error.
5. Launch: `scripts/show/stage-open.sh --space platina --project platina-screen --stage-ws 2 --tool-ws 1 --base <url>` (`--dry-run` first, `--help`).
