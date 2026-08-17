## 2026-08-18 — di sync phase 2, PR 3: link, ledger, and an audit that refuses what it cannot prove

- `di link <space> --remote <url>` — pastes a `dii_sync_*` key, verifies it against the
  remote BEFORE storing anything (reachability, key accepted, space exists, verbatim
  supported — a peer without `?verbatim=1` is refused at link time, not discovered at
  write time). Writes the key 0600 into `~/.di/credentials.json` (now also swept by
  `di uninstall` — secrets are not "your work") and an initial ledger.
- The ledger (`~/.di/data/sync/<remote>/<space>.json` — under data/ so backup carries it
  and update can't touch it) is the origin field ops don't have: installId minted once
  into state.json, version cursors null until a real sync, opId dedupe lists, and the
  assetIdRemap that stops EXIF-re-encoded images double-counting forever.
- `di sync <space>` — reads both sides verbatim-or-refuses, prints what it can prove,
  writes NOTHING. Relation is anchored only by cursors (unknown / in-sync / local-ahead /
  remote-ahead / diverged); diverged refuses both directions since scene ops have no
  inverse. The retention wall is reported up front per direction. All decisions live in
  pure `sync-plan.mjs` (no server needed to test); all I/O in `sync.mjs`; all words in
  `ui.mjs`.
- Verified end-to-end against two real serverXR instances with separate data roots and a
  DI_HOME with a dot in it: link (bare URL auto-resolves to /serverXR), unknown-relation
  refusal, divergence report (v1/1-object vs v0/0), baseline → local-ahead with push
  possible, revoked-key denial (seen on the auth-on instance), remote-down. 25 new unit
  tests across syncPlan/syncLedger/credentialsStore; whole scripts/di suite green; lint 0.
- Spec: `docs/architecture/SPEC_di_sync.md`. No new server endpoints — the #119 surface
  is the whole protocol. Next: PR 4 `--push`/`--pull` over ops; PR 5 `--replace-*` bundles.
