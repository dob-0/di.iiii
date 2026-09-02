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

### The audit said equal. The screenshot said grey.

`dilijan/welcome` on localhost and on staging, side by side after the mirror: same room, same
camera, same 265 objects — and the photo wall **grey on local, sixteen photographs on
staging**. The audit compared documents and the documents matched.

The upload route strips EXIF/GPS **before** hashing, so a scrubbed file no longer hashes to
the id the caller sent. The route drops the requested id, stores under the new content
address, and answers **200**. `project-pull` counted a success and left the document pointing
at ids that are now nowhere. Its own comment said the opposite: *"Ids are preserved so the
document's existing references resolve without rewriting."*

    16 assets stored locally, 16 referenced by the document, ZERO ids in common

Measured across the dev box: **106 of 244 assets unresolvable, in 8 projects** —
`library/di-library` 51/51, `dilijan/desk` 17/17, `dilijan/welcome` 14/16.

`scripts/asset-remap-lib.mjs` reads the id the server actually stored out of its own
response and follows it through the document — `assets[].id`, `assets[].url`,
`components.media.assetId`, `worldState.environmentAssetId`, and asset URLs inside
`presentationState.codeHtml`. Deliberately a generic walk rather than a field list, because
that list grows every time a component learns to carry media. Both `project-pull.mjs` and
`tier-sync.mjs` re-PUT the document when anything moved.

Re-pulling a photo-heavy space hits the local upload limiter (60 per 10 minutes). A 429 is a
wait and a retry, not a failure.

Fixed, re-pulled, and looked at again: **106 → 0 unresolvable**, and the photo wall on
localhost now carries the same sixteen photographs as staging.

**A consequence that had to be designed for.** Because each tier scrubs on arrival, the same
photograph is legitimately stored at two different content addresses — so the audit reported
all 7 photo-carrying projects as drifted *immediately after copying them correctly*. That is
the cries-wolf failure again, arriving by a different road. `documentSignature` now carries a
second `shape` hash, taken with every asset addressed by NAME instead of by id, and
`planAudit` reports those as a separate class: **"same work, assets re-addressed on arrival —
not drift to fix"**. It is not a claim of equality — nothing in a document can prove two
rewritten files are the same picture — which is why it is a class of its own and never folded
into a match. A photograph actually swapped for a different one changes its filename, and the
strict hash still catches it. Both cases are guarded.

### Done

- **71 `br-id-ge` projects local → staging**, 0 failed, documents verified equal and
  `n2-hub` looked at on staging as a plain visitor with no token.
- **`--audit`** with 12 new guards (18 in `tier-sync.test.js`, 7 in `asset-remap-lib.test.js`).
- **The dev box re-mirrored FROM staging** with `--tier staging --force`, so localhost and
  staging finally hold the same work. `serverXR/data/di.db` backed up to `~/di-backups/`
  first — a forced mirror overwrites every local copy.
- Final audit: **0 projects with different work.** What remains is the 23 debris below, and 7
  projects whose assets were re-addressed on arrival.

### "It's really not the same" — because every worktree is its own tier

After all of the above the owner opened localhost and it still did not match staging. It
could not: **each worktree's `serverXR/.env.local` says `DATA_ROOT=./data`**, relative, so
every worktree runs its own database. Seven on this machine, five of them stale copies. I had
synced the one in *my* worktree; the dev router hands the owner whichever stack booted first —
a different tree, a different `di.db`. Verified on my surface, not theirs.

Fix: **one shared local tier at `~/.local/share/di.iiii/data`** (the synced data copied there,
WAL checkpointed first), and `DATA_ROOT=` pointed at it, absolute, in every worktree's
`.env.local`. Proven, not assumed: `/proc/<pid>/fd` of the `:4000` server shows it reading the
shared `di.db`, and `frontframe.dii.localhost:8088` serves it. The env-file edits themselves
were refused by the permission classifier (they hold tokens) — `scripts/tmp-share-local-tier.sh`
does all ten and the owner runs it. A stack already running keeps its old database until
restarted.

### `--changed` — the "work local, push to staging" flow

Pushes what the audit says differs, plus what is missing; never touches a re-addressed one.
Keeps a baseline (`<DATA_ROOT>/tier-sync-baseline.json`, keyed by destination) of what was
last synced, and **refuses** a project that changed on both sides since — or that has no
baseline at all. That second rule was learned the hard way: the first live dry run, with no
baseline, queued an hour-old local copy over `br-id-ge/landing`, which someone had edited on
staging twenty minutes earlier. The baseline is now established from whatever the two tiers
already agree on, so one run after a mirror makes everything known-synced.

Also found while running it: `platform-recordar` on **staging** references an image by one
id in its page and lists it under another in `assets[]` (one image, two ids — a pre-scrub
manifest). Local's copy is consistent; staging's is not; the audit refuses it correctly.

### Owed

- **23 debris projects in `open`** — `debug3-true-false-1784237913844`, `td-check2-…`,
  `phase5-test-…`, `untitled-project` — local-only, deletion refused by Claude's permission
  classifier, so the owner runs `node scripts/tmp-purge.mjs` (untracked; archives every
  document to `~/di-backups/` first). Until then the audit's only finding is those 23.
- **Two owner-run scripts, both untracked:** `scripts/tmp-share-local-tier.sh` (points every
  worktree at the shared tier) and `scripts/tmp-purge.mjs` (the `open` debris). Land or delete
  after running — a one-off that survives in a worktree is a trap for the next session.
- **`platform-recordar` on staging** — page uses asset `0bda33d5…`, manifest says `c8155802…`
  for the same image. A re-save in Studio or a one-line manifest fix; until then `--changed`
  refuses it, correctly.
- **New worktrees still get `DATA_ROOT=./data`** unless whoever creates them copies a fixed
  `.env.local`. The durable fix is `dev-stack.mjs` refusing a relative `DATA_ROOT` on this
  machine, or the main checkout's `.env.local` being the template. Not done.
- A `--pull` direction: `--audit` reports drift and stops, because which side is right is a
  question about the work, not about the data.
- **`/tmp` is a 16 GB tmpfs and was found at 100%**, which killed commands mid-task with
  ENOSPC. 13.9 GB of it belongs to two *other* Claude sessions' scratchpads
  (`2573aee0…` 9.7 GB, `7e7c16ea…` 4.2 GB) and was deliberately left alone. Anything a
  session needs to survive a reboot does not belong in the scratchpad — `tmp-purge.mjs` was
  moved to `~/di-backups/` for exactly this reason.

### Not part of this branch, done live on prod the same session

`library` and `funding` invite links minted for Emilya (label `Emilya`, link expires
2026-09-09; the access it grants is permanent). Verified in a clean browser: refused with no
link, full page with it, still open on a later visit with `?invite=` gone. The previous pair,
labelled "Gevorg", had expired on 08-26 having never been opened. Details in auto-memory
`reference_dii_prod_data_writes`.
