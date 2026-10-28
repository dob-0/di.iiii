## 2026-10-28 — Studio: Undo and Redo buttons you can see, and "Saved" in words

- UX audit slice S03 (F025, F089). Undo and Redo buttons in the Studio control cluster header and in the phone top bar; both call the same `undo` / `redo` as Ctrl+Z and are disabled at the ends of the history.
- New `StudioSaveLine` says `Saved 14:32`, `Saving…` or `Not saved: …` from the sync state; `StudioEditor` now passes `pendingOpCount` and `authExpired` in `syncState`.
- Not done: the "Undone: ..." message and a Versions list (F025 fix direction), the keyboard side (S58).
- Review: the save line said "offline" for every sync failure; it now says offline only when the server was unreachable, "trying again" for a refusal or a conflict that keeps coming back (regression test in StudioControlCluster.test.jsx).
- Review round 2: the line is silent until the project has loaded (and says `Not opened` on a load failure); `aria-live` only for a failure; the sync dot is the scene connection only (no red repeat of a save failure); phone Undo/Redo 44 px. Pictures (scene and page project at 1440 and 390, Saving and Not saved) NOT taken yet: both test-browser lanes were held by other jobs; owed before merge. Still owed as its own plan row: the "Undone: ..." message and a Versions list with restore.
