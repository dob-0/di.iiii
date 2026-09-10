## 2026-09-11 — where a window sits belongs to the person, and windows can fill the canvas

First stage of the connected workspace the owner asked for ("max pro level
working space"). No new capability, no second window system — Raw already has
the desk; this is the part of `docs/architecture/RAW_WORKSPACE.md` §5.3 that was
written in August and never built.

Window geometry lived in `node.values.frame`, inside the collaborative document.
So moving your window moved it for everyone in the project, and for you on your
phone, and pushed an undo entry. Now:

- `src/raw/utils/workspaceLayout.js` — the pure half: scope key (space, project,
  narrow/wide), `mergeFrame` (local over the document's seed, field by field),
  `pruneLayout`, `maximiseFrame`/`restoreFrame`, `cycleFocus`.
- `src/raw/utils/workspaceLayoutStorage.js` — a versioned envelope in
  localStorage, every read and write wrapped.
- `src/raw/utils/useWorkspaceLayout.js` — `frameOf(node)` is now the one place
  anything asks where a window is; writes are debounced and flushed on unmount.
- `RawEditor` — drag, resize, focus, minimise, pin, close and reopen all write
  local state. The document is read as the SEED and never written by an
  arrangement, so an untouched project opens exactly as it did and the projector
  (`RawOutSurface`) is unaffected.
- `DesktopWindow` — a fourth header control: Maximize/Restore. It fills the
  canvas, not the page (topbar and the reserved bottom band respected), pins
  while maximised (a pan would otherwise slide "full screen" off the screen),
  comes to the front, and restores to where the person left the window rather
  than to the document's seed.
- `Ctrl+\`` walks the pile of windows top to bottom; Shift walks back.

Guards: `workspaceLayout.test.js` (14), plus RawEditor cases asserting that
dragging/minimising/closing a window emits NO `updateNode` op, that an untouched
project opens on the document's frame, that an arrangement survives a reload
while the document does not change, and that maximise raises and restores
losslessly. `selectMountedPanelNodes` takes a `frameOf` so a window closed on
this device stops being mounted.

Looked at: local canvas at 1440x900 and on a phone (Galaxy S9+) — maximise fills
the canvas clear of the topbar and the zoom controls, the arrangement survives a
reload, and the phone gets its own layout slot rather than inheriting the
desktop's.

Not in this stage, and next: every tool as a window (`view.surface`), the code
window, named layouts.
