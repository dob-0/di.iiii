## 2026-10-17 — show-scenes-job skill drafted from the MOXIR v6 scenes job

- Added `docs/ai/skills/show-scenes-job.md`: steps 4–6 of venue-to-show as one method (inputs → two designs → judging → build + guards → copy project → pictures → pick → apply with undo → review), plus a lanes section and the v6 traps as rules.
- Docs only; no code changed. Every command in it was checked against the scripts' flags (`--help` where the script has it, the module doc otherwise).
- Not done: there is no one-command launcher yet (owed row in the skill, §9); `picture_palette.py` was not run here (needs numpy).
