## 2026-10-01 — fold the 23 session notes left on dev after #686–#699 into PROGRESS and CURRENT

- The CI `land` job did not fold the notes after the #686 deploy, so 16 (then 23, after #697, #698, #699 merged) sat in `docs/ai/sessions/`; the pre-push gate refuses a push from a `dev` checkout while they do.
- Done with `session-land-lib` (the same functions `npm run land` calls), not the script itself: its last step sweeps worktrees, which would reach other sessions' checkouts. `CURRENT.md` stays under its 50-line limit.
- Owed: find why the CI land job skipped the fold on the #686 deploy (dev deploy for that commit was green); this note is the one the gate requires for this branch and folds on its own merge.
