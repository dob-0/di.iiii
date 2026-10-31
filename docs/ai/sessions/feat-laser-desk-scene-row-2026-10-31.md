# Laser desk Scenes row (ledger N1612; asks N1530, N1587), 2026-10-31

Branch `feat/laser-desk-scene-row-2026-10-31`, base `07d84dd00` (copy 9). Owner, 16:5x, looking at the laser desk: "still its the old ui with no
scenes and not connected lights and laser together". One press of a scene must play its lights and its laser look.

## What it does
A "Scenes" row at the top of the Looks pane on the Control page. One button per scene on the light desk, in the light desk's own order
(`GET ../light/api/scenes/summary`; on the Mac muth01 to muth09, then muth00), the laser look that follows it small under the name ("lights only"
when none). The scene the light desk has on has a bright border, a left bar and a bold name, and the row says it in words ("Lights on: MUTH 05 Catacomb.";
`GET ../light/api/summary` `activeScene`, once a second, not while the page is hidden or on Setup). The look on the cubes says LIVE (`liveId` of the
desk state the page already polls).

A press sends two requests, nothing else, each once (no retry):
1. `POST ../light/api/scenes/recall { id }` - the light desk's own route (the one its page uses).
2. `POST desk/api/go { look }` - the laser desk's own Go (the route a tile's picture click uses), after the same `flush()`; only when a look follows the scene.
It never arms, never lifts a Blackout, never changes Master or BPM. A refused or silent light desk is said in plain words on the row; the look is still
put on the cubes (the person at the desk pressed a scene; the lead may change this: one `if` in `pressScene`), and the words say which part happened.
A second press while one is on its way is ignored.

## Why a server change (small, additive)
`GET /laser/desk/api/follows` gave `links: {}` while "Follow light scenes" is off, and the Mac's switch is off (read 2026-10-31 from its state). The row must
work whatever the switch says, so the same route now also gives `table` (the same map, switch-independent). `links` is unchanged (empty while off), so the
light desk's page behaves as before. Catalogue text updated. Test: `sceneLink.test.js` "followMap: table ...".

## Where it lives
`serverXR/src/laser/ui/sceneRow.js` (pure rules, `window.DiSceneRow`), one block in `desk.js` between `barHeight()` and `refreshThumbs()`, one block at the end of
`desk.css`, one container + one script tag in `index.html`. No line of the top bar or the tile names is touched (another builder works there).
Tests: `sceneRow.test.js` (rules), `deskScenes.test.js` (the real page in jsdom with a fake light desk and a fake laser desk behind fetch).
Look: `scripts/audit/laser-desk-scene-row.cjs` (agent screen, writes the four pictures and the numbers).

## Measured (agent screen, 1278x758 CSS px, scale 2, scratch desk with the Mac's 10 scenes and 72 looks, switch off)
- Press MUTH 05: requests `/light/api/scenes/recall {"id":"muth05"}` then `/laser/desk/api/go {"look":"muth-05-catacomb"}`; light desk `activeScene` muth05, laser `liveId` muth-05-catacomb.
- 10 buttons in 2 lines, each 38 px tall (rule: at least 36), no sideways scroll. The row is 115 px high; the tile pane goes from 289 px to 174 px (the top bar is 128 px
  there, three rows, until the bar fix lands). The tile grid scrolls as before.
- Tests: `vitest run serverXR/src/laser serverXR/src/lighting serverXR/src/routes src/wiki serverXR/src/catalogueContracts.test.js`: Test Files 67 passed (67), Tests 877 passed (877).

## Limits
More scenes than two lines hold scroll inside the row. A quantised recall (the light page's snap) is not used here: a press recalls at once. Names fit in five columns at
172 px in the agent screen's font (DejaVu Sans, wide); not seen on the Mac's own font or screen. No real cube, no Mac write.

## Review (learn once)
Meant: one press plays a scene's lights and its laser look. Happened: built, tested, seen. Found on the way: (1) `/follows` gives `links: {}` while the switch is off and the
Mac's is off, so the brief's "from /follows links" could not work as written: `table` added. (2) The first picture showed names cut ("MUTH 03 Haunted Elec...") because a LIGHTS
tag took the width: the tag text is gone, the mark is the border, the bar, bold and the words on the head line; re-seen, names whole. (3) The first version of this note was
committed with text the code no longer matched (a failed edit script, unchecked): fixed in the next commit. Change for the brief template: when a brief names a route as the data
source, read its response with the switch in the state the show will have; and check an edit script's exit before committing.
