# Laser desk Scenes row (ledger N1612; asks N1530, N1587), 2026-10-31

Branch `feat/laser-desk-scene-row-2026-10-31`, base `07d84dd00` (copy 9). Owner, 16:5x, looking at the laser desk: "still its the old ui with no
scenes and not connected lights and laser together". One press of a scene must play its lights and its laser look.

## What it does
A "Scenes" row at the top of the Looks pane on the Control page. One button per scene on the light desk, in the light desk's own order
(`GET ../light/api/scenes/summary`), the laser look that follows it small under the name ("lights only" when none). The scene the light
desk has on is marked LIGHTS (`GET ../light/api/summary` `activeScene`, once a second, not while the page is hidden or on Setup); the look on
the cubes is marked LIVE (`liveId` of the desk state the page already polls).

A press sends two requests, nothing else, each once (no retry):
1. `POST ../light/api/scenes/recall { id }` - the light desk's own route (the one its page uses).
2. `POST desk/api/go { look }` - the laser desk's own Go (the route a tile's picture click uses), after the same `flush()`; only when a look follows the scene.
It never arms, never lifts a Blackout, never changes Master or BPM. A refused or silent light desk is said in plain words on the row; the look is still
put on the cubes (the person at the desk pressed a scene), and the words say which part happened. A second press while one is on its way is ignored.

## Why a server change (small, additive)
`GET /laser/desk/api/follows` gave `links: {}` while "Follow light scenes" is off, and the Mac's switch is off. The row must work whatever the
switch says, so the same route now also gives `table` (the same map, switch-independent). `links` is unchanged (empty while off), so the light desk's
page behaves as before. Catalogue text updated. Test: `sceneLink.test.js` "followMap: table ...".

## Where it lives
`serverXR/src/laser/ui/sceneRow.js` (pure rules, `window.DiSceneRow`), one block in `desk.js` between `barHeight()` and `refreshThumbs()`, one block at the end of
`desk.css`, one container + one script tag in `index.html`. No line of the top bar or the tile names is touched (another builder works there).
Tests: `sceneRow.test.js` (rules), `deskScenes.test.js` (the real page in jsdom with a fake server behind fetch).

## Limits
Height: the row takes about 100 px of the Looks pane (two lines of buttons), so the tile grid shows fewer rows at 1278x758; it scrolls as before.
More scenes than two lines hold scroll inside the row. A quantised recall (the light page's snap) is not used here: a press recalls at once.
Not tried on a real cube or on the Mac (the brief: no Mac writes).
