# fix/dilijan-cinema-to-dev

## The Dilijan hall's cinema reaches dev (the two N1259 commits stranded after #1125's squash merge)

- 2026-10-25: #1125 was squash-merged into dev at 2026-10-23 21:08; the cinema commits (3225cb431, e4dc7f83b) were pushed to
  `feat/aren-yard-looks` after that, so they never reached dev. This branch carries them onto dev unchanged (clean cherry-pick).
- What it adds: `apply-structure.mjs` `entities` (a media file named by an entity uploads once by sha256 and is named by assetId),
  its vitest (2 passed), the 54.5 s loop of the five worlds, and the hall's screen entity in `spaces/dilijan/structure.json`.
- Owed: applying the structure to dev (`apply-structure.mjs … --api https://dev.diiii.xyz --apply`) after merge; the owner's pick on
  the day-2 photo board that hides the screen's top ~1.2 m (N1259.4).
- 2026-10-25 owner: the day-2 photo board overlaps the cinema screen, not needed -> apply-structure gains `remove` (project -> [entity id]); the 16 day-2 photos are removed from `welcome`; tests 3 passed; applied on the test copy and seen (scratchpad hall-after.png).
- 2026-10-25 owner, next message: 'keep just photos' -> the photos come back (space restore point 2026-10-24T20-59-26-580Z on the test copy), the film leaves the screen (`remove: welcome -> e-screen-video`, the mp4 out of the repo). Seen: scratchpad hall-photos.png.
- 2026-10-25 owner: "make the preview of the portals of each world" (pictures on the photo board untouched). A door can carry a
  picture of its world: `components.media.assetId` on a portal fills its opening (round door or frame), cover-cropped
  (`portalPreview.js` coverCrop), veiled 0.85 idle / clear on hover, kept upright while the 'float' animation spins the
  ring in its own plane (`uprightTurn`). Wired in both renderers: EntityContent (Studio/Raw) and LiveProjectScene (viewer).
  The six Dilijan doors got squares in `spaces/dilijan/door-previews/` (mushroom + orange room: stills from the test copy;
  drive, yard, garden: frames of the 10-23 cinema film; Anahit & Vachagan: a still, cropped clear of the test browser's
  camera prompt). apply-structure: an existing entity keeps the components the structure does not name; an image's stored
  id differs from its file sha256 (server strips metadata), so the file hash rides in the asset name and a re-run finds it.
  Tests: 64 passed (10 files). Seen on cinema.diiii.localhost: 5 of 6 doors upright after 40 s; the garden door is behind
  the photo board in every view taken. Owed: dev write after merge; a re-run still re-writes e-door-6 (its `doors` entry
  is applied before the picture) — harmless, not idempotent.
