# feat: APC40 pad order, dark scenes left, bright scenes right (2026-11-27)

Owner N7302/N7303: "the left pad column should hold the darkest scenes and the right column the brightest, on every row and both pages".
Stacks on #1389 (`feat/desk-apc40-drawn-2026-11-27`, the drawn APC40 + blackout toggle), which stacks on #1388. Merge those first.

## What
- Show state `padOrder`: look ids (null = empty slot) or null = desk order. Saved with the show, sanitized on load, on POST and when `POST api/looks` replaces the looks (ids that vanished leave the pads). `state.looks` is never reordered: cues and ids stay.
- ONE mapping function, `padLooks(looks, padOrder)` in `ui/midiCues.js` (the only change there): slot i = `padOrder[i]` or `looks[i]`. app.js passes its result to the real pads, the LED painter, the drawn APC40, the page buttons and the page count (`padLooksOf()`); a padOrder longer than 80 means more pages; the same look may sit on two pads.
- `padOrder.js` (server, pure): `lookBrightness` = mean over every step, fixture and cell of dimmer/255 x (r+g+b+1.5w)/255; dimmer is dimmer + dimmer_fine/256; a pixel bar's r1..w1, r2.. are one cell per number; no dimmer role = full; a ref counts 0. `brightnessOrder`: looks sorted by brightness (ties: desk order), 8 equal bands (first n%8 bands one longer), band c = column c, rows keep desk order, row r column c = slot 8r+c (5 rows = a page; 80 looks = 10 per column over 2 pages; a short column ends in empty slots).
- Route `POST api/midi/padorder`: `{mode:'brightness'}`, `{order:[ids]}`, `{clear:true}`; `GET` returns `padOrder` and every pad (slot, page, row, column, id, name, brightness x 100). No ARM needed: it changes the desk's list, sends nothing to the rig. In api-contract.json as class c.
- MIDI pane: buttons "Order pads dark -> bright" and "Desk order" in the APC40 pane head; the drawn APC40 shades its 8 column headers by the column's mean brightness on the page; the legend says "columns dark to bright". This tab's own set wins 3 s over a state poll already in flight.

## Checked
- Brightness from the live show's 2026-11-27-034941 checkpoint: "C2 Dream" 0.5, "6 Amethyst tide" 92.2 (x100), as dob-3f measured (test skips when the checkpoint is absent). The 2026-11-26-222045 checkpoint gives 67.6 for Amethyst, it had older looks.
- vitest `serverXR/src/lighting`: 15 files, 176 tests pass (was 14 files, 152; padOrder.test.js adds 24: metric, band layout, sanitize, mapping, LED velocity and painter, drawn pads and headers, page count over 80, route + save + reload).
- api-contract lint ok (83 routes). eslint on serverXR/src/lighting: 0 errors.
- Test copy `di-dev up pad-order --api scratch`, scratch show built from the checkpoint's API state (80 looks, 33 fixtures), output disabled (checked `output.enabled` false). Order applied with the button; pictures at 1536x864 and 1534x830, desk order and dark -> bright, both pages (`~/work/agent-reports-2026-11-27/pad-order/`): 48 labels, 0 cut, 0 outside in all 8; headers grey 56..193 left to right on page 1, 63..202 on page 2. Stack stopped and wiped after.
- Not checked: the real APC40 (the owner plays it), the live desk (untouched: no POST, no reload). Turning it on at the live desk is one POST (see below).

## Review fixes (#1393 review, I1 L11 L12 L13)
- I1: an unknown id in padOrder becomes an empty slot, never dropped, so a deleted look (also through api/looks/remove) or a restart moves no other pad. Test: delete one look, reload, every other look keeps its pad.
- L11: a look made while an order is set (looks/add, or new ids in a looks replace) takes the first empty slot of its brightness column (rank among all looks, 8 bands), else a new row after the last slot; nothing else moves.
- L12: the pane counts looks, and says "N not on the pads" when some have no pad; the legend counts distinct looks.
- L13: while ARMED the two order buttons ask for a confirm.
- Not done: L14 (one-poll flicker with an empty looks race poll) is outside this ask.

## Turn it on / off
`POST api/midi/padorder {"mode":"brightness"}` (the desk's /light/ base path); off: `{"clear":true}`. Rollback: revert the PR (a saved padOrder is ignored by the older code).
