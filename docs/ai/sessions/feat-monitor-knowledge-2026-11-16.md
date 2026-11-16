## 2026-11-16 — rules, hooks and agents' helpers reach the Monitor (data side)

- The reporter (scripts/di/monitorReport.mjs) now sends two panels, `rules` (one row per heading of the standing-rules file: title, date, line count, capped text) and `hooks` (event, matcher, tool + subcommand only), and adds recent helpers to the `agents` panel from file names, mtimes and the small meta label.
- serverXR/src/monitorHub.js whitelists both panels; src/components/preferences/monitorKnowledge.js merges agents, rules, hooks and ledger rows over all hosts for the desk windows (UI wiring is another branch).
- Owed: a helper's model is not in those files, so it is null; the desk windows that call the module are not in this branch.

## 2026-11-16 — skills panel

- The reporter sends a third panel, `skills`: one row per skill { scope user|repo|plugin, plugin, name, description } from the SKILL.md frontmatter `name:` and `description:` only (description capped at 200 chars); the body is never read past the closing `---`, and the only path part sent is a plugin's name. Plugin skills cached in several versions count once. Counts per scope sit in the panel; a missing folder is an empty list, an unreadable ~/.claude is { ok:false, why }.
- monitorHub.js whitelists `skills`; monitorKnowledge.js merges it over hosts ("same on N machines") as `skills`.
- Tests: made-up skills including a body that must not leave; 200 skills keep the whole report under REPORT_MAX_BYTES.
