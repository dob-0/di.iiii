## 2026-09-02 — the dev box was never a copy of staging

`tier-sync.mjs` was written to move work UP a tier, because `local:mirror` and
`project-pull` only ever move it down. It worked, and then it lied: after copying
`br-id-ge`'s 71 Notations 2 scenes to staging it reported **"nothing to move — the
destination already holds everything the source has"** while 32 documents differed
between the two tiers.

It compared **project ids**. Two tiers can hold every slug in common and different work
inside every one of them, and that is exactly the drift that had been reported from the
desk: *"when you work and push to staging and open local it not the same."*

### Why they were never the same

Two rules in `local-mirror.mjs` — both documented, both silent, both mine:

1. **"Prod always wins for a space both tiers hold."** The dev box mirrors PRODUCTION
   first. It was never a copy of staging.
2. **"Existing local projects are left alone unless `--force`."** A project the mirror has
   already seen never refreshes again.

So local is a copy of *prod*, frozen at first contact. Measured across three tiers — 6 of
12 sampled projects were byte-identical to production and differed from staging:

| project | local | staging | prod | |
|---|---|---|---|---|
| dilijan/tsaghkanots | 20629p | 7261p | 20629p | local == prod |
| dilijan/the-yard | 21602p | 23697p | 21602p | local == prod |
| dilijan/welcome | 0e 1802p | **265e 16a** | 265e 16a | local behind BOTH |
| open/open-jam | 3e 5n | 47e 16a | 49e 16a | three versions |

### `--audit`

    node scripts/tier-sync.mjs --from local --to staging --audit

Reads every document from both tiers, compares signatures, exits 1 on any drift. Three
classes: only-on-source, only-on-destination, and **same slug / different work** — the one
the id comparison could not see.

**Two traps it had to be taught, both found by running it:**

- **A published page is not an entity.** It lives in `presentationState.codeHtml`. On
  entity count alone, `main/brand-guide` (354KB), `funding/funding-board` (300KB),
  `dilijan/t-workbench` (2.7MB) and every room of the Dilijan camp read as **empty**. The
  first pass of a purge of "empty" projects had all of them on its list. Nothing may call a
  project empty on entity count alone.
- **`projectMeta.createdAt`/`updatedAt` are per-database bookkeeping** — when *that* tier
  first saw the row, not when the work changed. Every project a sync has ever moved is
  stamped on arrival. First live run: **155 differences, 138 of them nothing but those two
  numbers.** `VOLATILE_PATHS` strips them, with `publishState.lastExportAt` and
  `showState.clockEpoch`. Add to that list before adding a field a tier stamps for itself.

After stripping: 55 real differences — 23 debris in `open`, 32 genuine content drift.

### Done

- **71 `br-id-ge` projects local → staging**, 0 failed, documents verified equal and
  `n2-hub` looked at on staging as a plain visitor with no token.
- **`--audit`** with 8 new guards (14 in the file).
- **The dev box re-mirrored FROM staging** with `--tier staging --force`, so localhost and
  staging finally hold the same work. `serverXR/data/di.db` backed up to `~/di-backups/`
  first — a forced mirror overwrites every local copy.

### Owed

- **23 debris projects in `open`** — `debug3-true-false-1784237913844`, `td-check2-…`,
  `phase5-test-…`, `untitled-project` — local-only, deletion refused by Claude's permission
  classifier, so the owner runs it. Their documents are archived before the delete.
- A `--pull` direction: `--audit` reports drift and stops, because which side is right is a
  question about the work, not about the data.
