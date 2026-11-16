## 2026-11-16 — rules, hooks and agents' helpers reach the Monitor (data side)

- The reporter (scripts/di/monitorReport.mjs) now sends two panels, `rules` (one row per heading of the standing-rules file: title, date, line count, capped text) and `hooks` (event, matcher, tool + subcommand only), and adds recent helpers to the `agents` panel from file names, mtimes and the small meta label.
- serverXR/src/monitorHub.js whitelists both panels; src/components/preferences/monitorKnowledge.js merges agents, rules, hooks and ledger rows over all hosts for the desk windows (UI wiring is another branch).
- Owed: a helper's model is not in those files, so it is null; the desk windows that call the module are not in this branch.
