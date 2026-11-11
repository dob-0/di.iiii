## 2026-11-10 — Perform: lego blocks, minimal

Owner: "we need to all ui and like it lego and minimal not like now" (after "ui is ugly", "make our style look how place used bad"). Spec written before the build; every decision cites `~/work/di-brand/SYSTEM.md` (rule numbers are its section 1).

**Measured before (live page, 1920x1080, by the lead):** 59px title bars with a kicker line; window buttons mid-bar and the word "pinned"; ~24px gaps and ~70px dead bottom margin; prose inside blocks; controls 24-44px high in mixed styles (native select, range, checkbox); a purple default link; "Constellation" overflowing its button; Master and Clock mostly empty.

**Decisions**
1. Unit grid (`GRID` in `src/perform/presets.js`): wide 12x8, narrow 4x8 ("N rows" read as 8; say so if wrong). Presets are whole units and fill the area. Stored form stays PERCENT (schema clamps), frames are derived and snapped. Bottom reserve 0 (`measureArea` in `PerformDesk.jsx`, `bounds` to `clampWindowFrame`): the reserve existed for AccountButton's "Sign in" chip and the delete FAB; Perform has no tray (a minimised block stays in place as a header). UNCHECKED: the chip may cover the bottom-right corner. Rule 3 (structure = 1px line, nothing else).
2. Blocks touch: each block draws only its right and bottom 1px border (`border:0` first to kill raw.css's 2px top). One line between two blocks, no gutter, no double border, no shadow (rule 3, rule 4: nothing floats here, so no shadow).
3. Snap: `DesktopWindow` takes `grid`, `bounds`, `blockKind`; only Perform passes them, so the Nodes desk keeps free placement. Arrow keys move one unit. "+ window" = `rectForAddedWindow`: first free unit area of the kind's default size, else on top as before.
4. One anatomy: header ONE row, `--perform-head` 24px (44px under `pointer: coarse`); only the NAME (mono, uppercase, tracked, rule 5); kicker and "pinned" hidden; max/min/close at the right, shown on header hover or focus-within, always on coarse. Body padding `--di-space-2`.
5. No sentences: empty states at most 4 words plus one action; hints in `title`; aria-labels and state kept; link in ink with underline, `:visited` the same.
6. One control (`--perform-control`, 24/44px): button, select, text field, toggle, slider. 1px `--di-line`, `border-radius:0` (rule 2), mono uppercase (rule 5). Select `appearance:none` with a drawn arrow; checkbox drawn; range = 2px square track, 8x16 square cap. The cap is a deliberate departure from rule 2's round-thumb exception: the cap is taller than the track so it still reads as grabbable (rule 2's reason). `vjDeck.css` takes `--vj-control: var(--perform-control)`.
7. Accent marks meaning only (rule 1): state tags are an 8px square (filled cyan = live, ink edge = black, dim = absent) plus the word; the pressed/live tile uses the `inset 2px 0 0` emphasis bar (rule 3); focus is the inset 1px ring (rule 3). Danger uses `--di-danger` (rule 7).
8. Look grids: `.perform-tiles`, `minmax(0,1fr)` columns (2/3/4/6 by container width), ellipsis.
9. Blocks use their space: Master is one row, a 1-unit brick (blackout, 3 state squares, deck master, light master, laser level only when the laser exists); Clock one row (BPM, 4 beat squares, TAP, RESET, Follow). `show` (wide): deck [0,0,6,7], Light looks [6,0,3,4], Laser looks [9,0,3,4], cues [6,4,6,3], master [0,7,8,1], clock [8,7,4,1]; no empty brick.
10. NEW `lightlooks` window next to `laser`: status in 4 words, the desk's looks as tiles (press fires, live look marked), a light master. Reads only when the show clock says the desk is up (every Light route but the clock builds the desk, `serverXR/src/routes/lightingRoutes.js`), at the SPACE address `/light/space/<id>/api/...` (409 `other-show` otherwise). Desk unreachable or no show here: one calm status.

**Why "Light desk is not open" for a platina project when the clock says `{"up":true,"bpm":140,"show":"moxir"}`:** the clock route is NOT space-keyed, so it reports whichever desk is open. That desk runs moxir's show; platina's space-keyed path would answer 409 `other-show`. `lightRelation(light, spaceId)` (`src/map/lightingLink.js`) separates four cases; on screen the block says `LIGHT: OTHER SHOW` (other), `LIGHT DESK OFF` (not open), `NO LIGHT DESK` (none here). Test: `src/perform/PerformLight.test.jsx`.

**Not changed:** deck model/ops, server, arming (no arm control), the Nodes desk, existing preset ids. The laser block stays optional; no production is named in the platform.

**Not tested:** no browser, so nothing is claimed about how it looks; phone; AccountButton overlap; any real look fired. Tests: presets, PerformLaser, PerformLight, spine (CSS ladder, no literals).

## Review round 1: deck and K2

Findings fixed (verified by reading first; all were real):

1. **Upload into a stale deck** (`VjDeckView.jsx` `place`/`onFile`): the clip is now placed into `latestDeck` (a ref set from the prop and from every `write`), into the slot picked when the file was chosen. Test: "a slow upload places its clip into the LATEST deck".
2. **Coalescing** (`useDeckMidi.js`): continuous actions (opacity, blend, speed, crossfade, master, bpm, relative nudges) write at most once per `WRITE_GAP_MS` (30 ms) with a leading write when idle and a guaranteed trailing write; discrete actions flush the pending value first, then write at once; unmount flushes. The local deck (`ahead`) updates on every message.
3. **Ahead of the document**: the `deck` prop is adopted only when it is not an echo of one of our writes (we keep the JSON of up to 64 in-flight writes). An older echo is dropped from the list and does not roll the local deck back. A foreign deck (another window, a click) is adopted, drops a not-yet-written fader value computed from the old deck (at most ~30 ms of motion), and resets pickup. Known limit: a UI click while a fader value is pending is a "foreign" change, so that pending value is dropped.
4. **One owner per deck id**: module registry in `useDeckMidi.js`; the first mounted editable instance owns the controller, the next takes over on unmount; a read-only view never owns. MIDI access is now `midiPorts.js` (one `requestMIDIAccess`, only while `active`), because `useMidiInput/useMidiOutput` in `raw/utils` cannot be switched off. A read-only view does not call `requestMIDIAccess` (test).
5. **Learn blocks the control**: pointerdown/mousedown/keydown in capture on `[data-midi-target]` are prevented while Learn is on (Tab and Escape pass); Enter/Space select the target. Off = untouched (test, both directions).
6. **Soft takeover**: pure `softTakeover` + `PICKUP_WINDOW` (3/127) in `deckBinding.js`; state per control is the `pickup` Map the hook keeps (`applyMidi` ctx). Arrival = within the window or crossed; pickup restarts when the target is no longer where the control last put it. Blend uses its bin as the window.
7. **expandDeck**: a layer with an active clip keeps its source (`top.clip` / `top.camera`) and its blend with stable ids; opacity 0, bypass, solo and the crossfader set `mix` to 0. Test pins ids and wires across opacity 1 to 0 to 1, bypass, solo and crossfade. Not checked here: that the runner skips a mix-0 blend cheaply (it does not need to; the node just stays alive).
8. **Cameras**: `cameraFailureText`: busy only for NotReadableError / TrackStartError / AbortError; NotFoundError says "No camera on this machine"; NotAllowedError keeps the "blocked" text; the rest "Could not open the camera.". `cameraNodeId(deckId, label, device)` hashes label + device when a device hint exists; with none it is the old id. Clips saved WITH a device hint get a new id once (one camera reopen on upgrade).

**To confirm on the real K2 (not guessed):** `encoder 5` (crossfade nudge) and `encoder 6` (master nudge) carry the sheet's `check` note ("confirm relative by MIDI-learn"). The default keeps the sheet's `mode: relative` for both; a test pins that both are the only `check` rows. Turn each and see whether the value steps by a small amount (relative) or jumps (absolute); if absolute, relearn it in Learn.

**Not tested:** no browser, no real K2, no real camera; the pointer/mouse behaviour of a native `<select>` is checked by `defaultPrevented` in jsdom, not by seeing it stay closed.

## Clean-run layout fixes (2026-11-10)

Seen on the owner's real window; each is a cause fixed in CSS or layout data, nothing hidden.

1. **Master bar overlap** (`perform.css` `.perform-bar`): the bar was a no-wrap row with `overflow: hidden`, so at 979 px the DECK / LIGHT / LASER sliders, their numbers and the state words were squeezed onto each other. Now `flex-wrap: wrap`, `overflow: auto` (never a cut), the state words wrap (`.perform-states`), and a slider has a floor width (`min-width: min(100%, 120px)`) so it moves to the next line instead of under its neighbour.
2. **Laser master over Follow light** (`.perform-row`): a no-wrap row holding the slider (number "100") and the button. The row wraps now.
3. **Narrow layouts** (`presets.js`): `vj-windows`, `wall`, `light`, `caller`, `unattended`, `guest`, `show` had windows in `wide` that were missing in `narrow` (Show had no deck). Every preset now names every window in both classes, master is 2 rows tall everywhere (it needs two lines), and no two rects overlap. Narrow stays inside the viewport (blocks scroll inside themselves); the page never scrolls sideways. Wide `show`, `light`, `caller`, `remote`, `unattended`, `vj-windows` gave master/clock one row (or a 4-column cell); they got the rows they need.

Tests: `presets.test.js` (every narrow layout names every window; no two rects overlap, wide and narrow; master is at least 2 rows) and `performLayoutContract.test.js` (the wrap rules are in the stylesheet). Measured on the page (979, 1536, 640, 570 px wide): no two controls inside a block intersect, nothing is wider than its block, `scrollWidth <= innerWidth`.

Not fixed: the orange "dev copy" ribbon is fixed at the bottom-right and covers the last block's corner on a dev copy only. In narrow, a block that is short for its content (Cues, Deck) scrolls inside itself.
