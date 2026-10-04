# Organisation audit, 2026-10-05: the whole of di.iiii, and one plan

The owner, 2026-10-05: *"we need to manage and organize our tools, it's so messy — audit the whole di.iiii
and let's re-manage everything in the right place."* Four read-only audits ran the same night. Nothing was
moved, deleted or closed. Every step below waits for the owner's word, and each one has an undo.

| Part | File | What it covers |
|---|---|---|
| A · the code | [A-code.md](A-code.md) | `src/`, `serverXR/`, `shared/`, `sdk/`, `public/`, `spaces/`, `legacy/`: every address → code → server, wrong place, duplicates, one target layout |
| B · the tools | [B-tools.md](B-tools.md) | `scripts/`, `deploy/`, `di` / `di-dev`, hooks, skills, and the tools outside the repo (di-atlas, di-desk, `~`) |
| C · work in flight + docs | [C-work-and-docs.md](C-work-and-docs.md) | worktrees, branches, open PRs, `docs/`, the ledgers |
| D · MOXIR | [../../moxir/TOOLS_MAP_2026-10-05.md](../../moxir/TOOLS_MAP_2026-10-05.md) | the show's tools, its sources of truth, one rebuild |

## The numbers (counted, not estimated, unless marked)

- **Code (A):** the old editor (V1) is still live: 106 files, 18,611 lines reached only through `src/App.jsx`,
  and the admin console runs inside it. The project schema (2,717 lines) has a hand-kept server copy. One
  project has three renderers that have drifted twice. One show (MOXIR) ships inside every install
  (~300 KB of JSON + 2 MB of photos). ~4,650 lines are dead.
- **Tools (B):** ~215 tools; ~140 used, 24 dead or one-off (SUSPECTED), 32 duplicates in 6 groups, 29 in the
  wrong place. No README in `scripts/` or `deploy/`.
- **Work in flight (C):** 275 worktrees (~119 GB), 185 safe to remove; 62 open PRs (34 draft, 19 conflict
  with dev); 470 branches on GitHub (296 from merged PRs, 72 unmerged with no PR); audits in 6 places;
  `PROGRESS.md` is 19,708 lines.
- **MOXIR (D):** ~20 scripts and 5 pages change the 19 versions in place, 7 of those scripts are not in git;
  the versions now hold 3 picture states and 6 hall models; the light desk holds the wrong version.

## Two things that are failing now (not just untidy)

1. **A nightly backup fails with no alert:** `di-secrets-backup.timer` sends to the offline VPS
   (`deploy/secrets-backup.sh:24`). Owner decides the new target (B §3.2 rank 2).
2. **Supplier prices are public:** this repo is public and `scripts/rigbuild/rentals/*.json` hold Poligraf's
   per-unit rates; dev's `moxir-hall-known-full` document answers without a login and holds them too
   (checked 2026-10-05). di-atlas's rule is that supplier prices never go public. Owner decides.

## The one plan

The rule over all of it: **one place for each thing, and nothing the MOXIR show (17 Oct) loads moves before
the show.** The freeze lists are A "Must NOT move", B §3.4, C §6 and D §4.6; they agree.

### Phase 0 — save what exists only once (now; touches nothing the show uses)

| # | Step | From |
|---|---|---|
| 0.1 | Push the 5 worktrees that hold the only copy of work: `followgaps` (5 commits + 5 files, wrong upstream), `moxir-deskplan`, `reid`, `nocpanel` (75 uncommitted files, 19 days), `movement` (9) | C step 1 |
| 0.2 | Copy the 27 agent `REPORT-*.md` files left inside trees into the repo | C step 2 |
| 0.3 | Record the source and licence of `public/rigbuild/items/up-pdu60b.jpg`, or remove it | A rank 2 |

### Phase 1 — MOXIR, 5 → 17 Oct (D §4.5)

Git holds the design; one command (`build-show.mjs`, built on #767) builds the show version from git, shows
the difference with the live project, writes only that. Light (#766), the patch sheet, the show clock and the
equipment counts read from it. Land #765 #767 #766 #718; versions other than Known · full → `concept`;
safety fixes in the rig file only; **code freeze 14 Oct, data freeze 15 Oct.**

### Phase 2 — tidy that is safe before the show (docs and dead weight only)

| # | Step | Frees / fixes | From |
|---|---|---|---|
| 2.1 | Remove the 185 merged worktrees, one plain `git worktree remove` each (git refuses any with unsaved files) | ~100 GB | C step 3 |
| 2.2 | `scripts/README.md` + `deploy/README.md`: one line per tool, state, who calls it | the missing entry point | B rank 1 |
| 2.3 | Delete the two stale `/home/nooo` paths | | B rank 3 |
| 2.4 | All audits into `docs/audit/` with one index; index the 27 unlisted docs | 6 places → 1 | C step 5 |
| 2.5 | Close superseded PRs (#745 now; #760–#762 after #763) | | C step 4 |
| 2.6 | Delete the dead files (~4,650 lines), after one build proves the bundle is unchanged | | A rank 1 |

**Where the parts disagree:** D would close the 23 rig-stack PRs (#587–#630, #644, #659, #665, #755) now, as
their code reached dev in #637; C keeps them untouched until after the show. Closing a PR changes no running
code and `gh pr reopen` undoes it, but their session notes must be carried into one docs PR first. Owner
decides; the default here is **after the show**.

### Phase 3 — after 17 Oct: the right place for everything

- **Code (A ranks 3–16):** `src/` becomes `app/` (one route table), `engine/` (document, schema, viewer),
  `tools/<one per address>`, `lighting/` (one desk client), `ui/`, `works/` and a fenced `legacy-v1/`;
  the server becomes a thin `index.js` + `routes/ stores/ auth/ ai/ sync/`; `shared/` is generated, never
  hand-kept; MOXIR's data leaves the bundle for the `moxir` space.
- **Tools (B ranks 4–12):** `di-dev` lands in di-atlas main and lives in one place; the 15 tier-moving scripts
  retire as `di follow` closes its gaps; platform tools leave di-desk; `scripts/` gets folders by job; units in
  `scripts/ops/units/`; `package.json` scripts grouped by prefix.
- **Work (C steps 6–9):** mark the VPS/staging/cPanel docs superseded; split `PROGRESS.md`; one place answers
  "what is open"; delete merged branches; sort the 72 orphan branches; rebase or close the rig stack in one
  decision; a rule that an agent's tree goes when its PR merges.
- **MOXIR (D §4.4):** delete the retired in-place scripts; one README for the chain.

## The owner's decisions

1. Approve Phase 0 (save the 5 trees' work).
2. The secrets backup: new target, or off until one exists.
3. Poligraf's prices in the public repo and on dev: remove, or accept.
4. The rig-stack PRs: close now, or after the show (default: after).
5. Phase 2 steps 2.1–2.6: each, yes or no.
6. Phase 3: approve the target layout; it is sized and started after 17 Oct.

Limits: all four parts are static reads (no build, test or browser); "used" means a caller was found by
search, and each file marks its claims CONFIRMED or SUSPECTED.
