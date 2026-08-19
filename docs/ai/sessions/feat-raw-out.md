# feat/raw-out — the projector cable

Phase 1 of the show spine, part two: /out — a URL that renders just-the-room,
read-only, zero chrome, for a projector or any second display. The audit's
finding was blunt: no route rendered the room alone; the fullscreen Room was
unaddressable component state behind an editor, and a show could not run
clean.

## What changed

- Routing (`rawRouting.js`): `RAW_PAGE_OUT` + `buildRawOutPath`. Shapes:
  `/{space}/raw/projects/{id}/out` (project — rides the op-log sync, live
  across machines, works signed-out on public spaces) and `/{space}/raw/out`
  (the space's local canvas — lives in that browser). `?scope=<nodeId>` aims
  it at a container's room; parsed into `scopeId`.
- `RawOutSurface.jsx`: RawViewport with NO handlers passed — read-only by
  absence, not by guard. No graph, no topbar, no cursors, no selection.
  Project documents ride `useProjectDocumentSync`; a local canvas follows the
  desk live across windows via storage events (the desk already writes
  localStorage on every change — the event is the free channel). Screen Wake
  Lock requested and re-acquired on visibility. The ●-marked Camera of the
  scope frames the shot for free (RawViewport honours it).
- Known limits, documented in the manual: capture feeds (webcam/mic/MIDI)
  live in the window that owns them; Time-driven motion runs per-window
  clocks. Both named in USER_MANUAL's "Putting it on a projector".

## Verify

Two windows, one browser: desk on /open/raw places a cube; /open/raw/out
shows the cube alone (0 cards, 0 topbar); desk adds a sphere → out follows
live; a click in /out selects nothing. Screenshots read at DPR 2.

## Note to the next session

An `output.display` node (the projector as a patchable card: scope + camera
+ enable) and a read-only output key for private spaces are the designed
next steps — see the TD-operators audit in auto-memory.
