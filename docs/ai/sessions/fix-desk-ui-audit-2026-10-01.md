## 2026-10-01 — the desk in the visualiser shows its looks; look tiles say when a look lights nothing

- From emily-41's UI/UX audit of the MOXIR visualiser and desk (P0). Stacked on feat/desk-touch-looks-cues-2026-10-01 (#706).
- Framed (the visualiser's desk half; app.js marks `<html>` `is-framed` before the first render):
  - the ways out (di.iiii, ← project, Studio / Nodes / Projection), the page tabs, the tempo, snap, Save scene and the scene Go, and the performance strip all step aside;
  - Blackout stays, one tap, as a normal-width button, not the full-width phone bar;
  - a "Full desk ↗" link opens the same desk on Setup in a window of its own.
  Measured in a 390×240 framed pane on an iPhone-13 viewport: the first look tile moved from below the pane (377 px) to 208 px.
- The standalone phone desk keeps its full-width Blackout. An earlier comment calls it the panic button kept on purpose; changing it (audit #9) is Emily's call.
- Look tiles: `lookHealth(l)` judges a rig look (`rig-…`) against what is patched now. "nothing patched" when none of its fixtures is on the desk; "lights nothing here" when no patched fixture's dimmer (or, without one, colour emitter) is up. The tile is dashed and dimmed and keeps its reason under it. Looks made on the desk are never judged.
- Looks titled "… · hung rig" (the ground versions' copies of the set's looks, #712) sit under their own heading, "made for the hung rig", without the suffix.
- Tests: test-wiring.js +2 (both red on the old code). Checked in Chrome: desktop 1440×900 standalone, iPhone 13 framed. No page errors.
