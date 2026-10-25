## 2026-10-22 — Light v3 step 1.2: the output bus says "unreachable"; the show is backed up before it is replaced

- Owner asked for one combined Light ("v3"); plan `agent-reports-2026-10-22/light-one/PLAN.md` §2.2 and D5 (the installed desk had output ON to a dead address and an ENTTEC that was not plugged in, and said nothing).
- `outputStatus.js` answers ok / unreachable / off per route, with the reason; the wire pill shows it. `showBackup.js` copies the show into `backups/` before the desk switches shows, and `tools/backup-show.js` does it by hand before a reset. Code and tests only: the installed di on aylmo was not touched.
- Owed: the look (unplug the cable on the Studio laptop, the page says it); moving the three drivers into an `outputs/` folder (not needed for the status, so not done here); a Light-page control for the backup.
