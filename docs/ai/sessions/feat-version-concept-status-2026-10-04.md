## 2026-10-04 — a fifth version status, `concept`

- **Why.** Owner: "keep the others as concept, take only the good ones and concentrate on the new setup." MOXIR has
  17 versions; one setup is for the show, the rest are ideas worth keeping and not worth a main-row place.
- **What.** Status `concept` in both normalisers (`src/shared/productionVersions.js`, `shared/projectSchema.cjs`),
  ordered after kept copies and before archived. `versions.mjs set-status <id> concept`, and
  `set-status --all-except <id,...> <status> [--dry-run]` (candidates only; refuses a for-the-show not named;
  refuses unknown ids). `list` prints a `concept (n)` group; the audit lists a concept like any version.
  The row (`RigVersionSwitch.jsx`) folds concepts under ONE "Concepts (n)" button, same button style, 44 px,
  2 px radius, same open/close and same horizontal scroll as "Old versions (n)", so it does not overflow a
  phone; a concept you stand in is not folded.
- **Older installs.** Unknown status is dropped by the old normaliser (not shown, never promoted); an old server
  also drops the component from its document copy. Order of work: land, deploy dev, `di update --from` every
  install, then set statuses. Written in the decision note, "Concept".
- **Tests.** 4 new (shared order and both schema copies, `set-status concept` + list, `--all-except` dry run,
  refusals and result, the row fold). Run on the dev code the changed expectation and the new ones fail
  (5 failed of 1399); here src/rigbuild + src/shared + scripts/production + schemaSync: 1459 passed.
- **Owed.** Not seen on a real phone screen (tests only). The set-status on MOXIR is run by the main session.
