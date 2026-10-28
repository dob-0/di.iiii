## 2026-10-28 — Studio: Undo and Redo buttons you can see, and "Saved" in words

- UX audit slice S03 (F025, F089). Undo and Redo buttons in the Studio control cluster header and in the phone top bar; both call the same `undo` / `redo` as Ctrl+Z and are disabled at the ends of the history.
- New `StudioSaveLine` says `Saved 14:32`, `Saving…` or `Not saved: …` from the sync state; `StudioEditor` now passes `pendingOpCount` and `authExpired` in `syncState`.
- Not done: the "Undone: ..." message and a Versions list (F025 fix direction), the keyboard side (S58), before/after pictures on the agent screen.
- Review: the save line said "offline" for every sync failure; it now says offline only when the server was unreachable, "trying again" for a refusal or a conflict that keeps coming back (regression test in StudioControlCluster.test.jsx).
