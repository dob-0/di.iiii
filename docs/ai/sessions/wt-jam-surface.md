# Session notes — wt/jam-surface

## 2026-08-23 — the jam stops being a stripped editor and becomes a place you stand in

The Open Jam was Studio with about twenty things switched off (`jamMinimal` in
`StudioShell.jsx`). On the device the QR code actually targets that was worse than a
reduced editor — it was a broken one:

- the whole desktop layer sits behind `!isMobile`, so a phone at `/open_jam` had six
  controls and no route at all to the full toolset (the "All tools" escape lives in the
  desktop-only control cluster);
- presence emits on `pointermove`, which a touch screen never fires, so twenty phones
  were twenty solo sessions editing one document and never seeing each other;
- placement is `getViewPlacement` — the orbit target plus a six-slot ring keyed to the
  global object count — and everyone opens on the same saved view, so everyone's work
  landed in the same six spots.

### What shipped

A separate surface at **`/open_jam/scene`**, its own component tree under
`src/project/components/`, deliberately NOT a twenty-first conditional inside
`StudioShell.jsx`. Full-bleed first-person scene, no toolbar, one persistent `+`, a
thumb-reachable sheet with the five shapes and a photo, a count at the top, in-scene
markers where the other people are standing, and a plain link out to the full editor.

It writes through the existing ops pipeline (`useProjectDocumentSync`) into the same
project, so the editor at `/open/studio/projects/open-jam` opens exactly what was made.
No server change, no new op type, no schema change.

The address is a **sub-path of the already-reserved `open_jam` segment**, not a new
top-level `/jam`. Reserving a new word means first proving no space and no project
answers to it on any live tier, and this branch was not allowed to touch live data.
`/open_jam` itself is untouched and still opens the editor.

### The three pure modules

The scene is the hardest thing in this repo to check without eyes on a phone, so the
decisions that matter are plain functions with tests and no renderer:

- `src/project/jam/jamPlacement.js` — ground-plane raycast from the walker's own pose,
  clamped to arm's reach. The same technique as `computeGroundPoint` in
  `StudioShell.jsx`, written as maths because there is no DOM event here and the camera
  lives inside the renderer's tree. Studio's placement is untouched.
- `src/project/jam/jamOwnership.js` — the "mine" list, in localStorage, with the warning
  in capitals at the top of the file: a courtesy against accidents, **not** a security
  control. serverXR is the authority (MANIFESTO §5) and anyone with `editor` on the open
  space can already change anything in the document.
- `src/project/jam/jamPresence.js` — `standing` added as a SECOND field beside the
  existing 2D `x`/`y` cursor. The 2D fields are still sent, pinned to screen centre,
  because in a first-person view the crosshair IS the pointer and because
  `EditorOverlays` and `RawViewport` both read `cursor.x || 0` — dropping the field
  would have parked every jam visitor in the top-left corner of somebody's Studio.

### Four optional seams opened in `LiveProjectScene`

`document` (skip the duplicate fetch + SSE), `walkerRef` (publish the pose object),
`sceneExtras` (three.js children inside its Canvas), `showModeControls` (hide Fly and
the XR-entry buttons; the joystick is never hidden — it is the only way a phone moves).
Every default preserves today's behaviour exactly, and
`src/components/liveProjectSceneSeams.test.js` guards that they stay optional, because
four surfaces already render this walker and none of them pass any of these.

### One bug fixed on the way

Walk mode listens for WASD / arrows / space on `window` with no "is somebody typing"
guard, and preventDefaults space. Nothing had ever put a text field over a walkable
scene, so it had never bitten; the jam surface does, and there typing "was" walked you
backwards and no caption could contain a space. Guard extracted to
`src/components/walkKeyboard.js`, applied to both `window` listeners, tested.

### Still owed — a human has to look

Nothing on this branch has been seen. I have no browser and no phone. The list of what
must be looked at, and where, is in the PR body. In particular: the QR code and every
flyer still point at `/open_jam`, which still opens the editor — repointing them (or
`/open_jam` itself) is the owner's call and is one line either way.
