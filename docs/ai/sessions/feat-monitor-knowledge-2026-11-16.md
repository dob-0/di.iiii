## 2026-11-16 — rules, hooks and agents' helpers reach the Monitor (data side)

- The reporter (scripts/di/monitorReport.mjs) now sends two panels, `rules` (one row per heading of the standing-rules file: title, date, line count, capped text) and `hooks` (event, matcher, tool + subcommand only), and adds recent helpers to the `agents` panel from file names, mtimes and the small meta label.
- serverXR/src/monitorHub.js whitelists both panels; src/components/preferences/monitorKnowledge.js merges agents, rules, hooks and ledger rows over all hosts for the desk windows (UI wiring is another branch).
- Owed: a helper's model is not in those files, so it is null; the desk windows that call the module are not in this branch.

## 2026-11-16 — skills panel

- The reporter sends a third panel, `skills`: one row per skill { scope user|repo|plugin, plugin, name, description } from the SKILL.md frontmatter `name:` and `description:` only (description capped at 200 chars); the body is never read past the closing `---`, and the only path part sent is a plugin's name. Plugin skills cached in several versions count once. Counts per scope sit in the panel; a missing folder is an empty list, an unreadable ~/.claude is { ok:false, why }.
- monitorHub.js whitelists `skills`; monitorKnowledge.js merges it over hosts ("same on N machines") as `skills`.
- Tests: made-up skills including a body that must not leave; 200 skills keep the whole report under REPORT_MAX_BYTES.

## 2026-11-16 — round 3, data side: waiting messages and user skills at any depth

- New panel `spool` (scripts/di/monitorReport.mjs, whitelisted in serverXR/src/monitorHub.js): the messages a machine without the ledger spooled to ~/di-health/intake/FALLBACK.md, as { ok, file, count, rows:[{ at, session (8 chars), text (capped 400) }] } newest first, last 100; the year comes from the file's mtime (a December entry read in January goes to the year before); a missing or unreadable file is { ok:false, why }.
- ledger-relay takes the whole file (rename, rows, delete the taken copy) and puts no mark on single entries, so an entry still in the file is still waiting; a per-row `relayed` flag is not possible without changing the relay: owed.
- src/components/preferences/monitorKnowledge.js: `knowledgeSpool(hosts)` = { rows (each with host), count, hosts }, newest first, and `waiting` in monitorKnowledge().
- User skills: SKILL.md is now found at any depth under ~/.claude/skills (symlink loops skipped by real path, hidden and node_modules folders skipped, depth 6, 2000 folders, 300 skills); still name + description only.
- Tests with made-up files: spool parser (normal, odd lines, missing file, cap, year turn, report size with 100 x 400 chars), hub whitelist, knowledgeSpool, nested and looping skills.
