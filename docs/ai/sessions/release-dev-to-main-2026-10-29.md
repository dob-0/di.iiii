## 2026-10-29 — release: dev goes to main, so cinema-house can be followed and public on diiii.xyz
- Owner's word (22:1x): "this is the public work, keep the process, push to main". The hosq x ReA Opening space (cinema-house, Cinema House, 7 Nov) needs follow/join and the Public switch on main; both landed on dev on 10-02 and never reached main.
- dev merged into main on this branch. One conflict, scripts/check-fallback-patterns.mjs: dev's allowlist kept (it holds main's hotfix line and the sync-key lines).
- Main's own hotfix (space scope checked on the parsed route, isOpenAFile) is in dev too; verified in the merged tree.
- Not tested here: prod's data migration on the Mac. It runs in the upgrade window from di-atlas standby-deploy.sh with the rollback to the previous release written in the PR.
