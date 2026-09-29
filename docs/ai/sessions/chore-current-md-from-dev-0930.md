## 2026-09-30 — main gets dev's CURRENT.md so the hotfix deploy can pass the docs freshness check

- Hotfix #657 (bundle symlink read) merged to main on 2026-09-29, but its deploy stopped at "Check AI docs": main's CURRENT.md was last recapped 2026-09-24 while code changed 2026-09-29 (grace 2 days). Every other step, lint, build, tests and audits, passed.
- This branch changes one file: CURRENT.md, copied unchanged from dev (the `npm run land` output of 2026-09-29), not hand-edited. The next promotion carries the same content.
- The docs freshness check has no path for a hotfix that goes straight to main; still owed: exempt hotfix branches, or let the deploy read the recap date from dev.
- Not done here: the deploy of main has not been re-run; diiii.xyz stays on the 2026-09-24 version until it is.
