# fix/dilijan-cinema-to-dev

## The Dilijan hall's cinema reaches dev (the two N1259 commits stranded after #1125's squash merge)

- 2026-10-25: #1125 was squash-merged into dev at 2026-10-23 21:08; the cinema commits (3225cb431, e4dc7f83b) were pushed to
  `feat/aren-yard-looks` after that, so they never reached dev. This branch carries them onto dev unchanged (clean cherry-pick).
- What it adds: `apply-structure.mjs` `entities` (a media file named by an entity uploads once by sha256 and is named by assetId),
  its vitest (2 passed), the 54.5 s loop of the five worlds, and the hall's screen entity in `spaces/dilijan/structure.json`.
- Owed: applying the structure to dev (`apply-structure.mjs … --api https://dev.diiii.xyz --apply`) after merge; the owner's pick on
  the day-2 photo board that hides the screen's top ~1.2 m (N1259.4).
- 2026-10-25 owner: the day-2 photo board overlaps the cinema screen, not needed -> apply-structure gains `remove` (project -> [entity id]); the 16 day-2 photos are removed from `welcome`; tests 3 passed; applied on the test copy and seen (scratchpad hall-after.png).
