---
name: venue-show
description: Runbook for a venue and event job (MOXIR first, a techno night in a factory hall on 17 Oct 2026) — where each fact lives, the command for each job, which event agent owns which layer, and the traps already paid for. Use before any work on a venue's hall, rig, patch, show, paper or its space, so nothing is re-derived.
---

# Venue show — learn once, do not re-derive

The owner, 2026-10-07: *"what we create, it learns, so in future we don't spend credits doing the same."*
This file is that memory for venue and event jobs. Read it before you open a rig file. If something here is
wrong, fix this file in the same branch as the work that proved it wrong.

Background, in order of depth: `docs/architecture/EVENT_LAYERS.md` (the layers L0–L10 and the agents),
`docs/architecture/RIG_BUILD.md` (method and data model), `scripts/rigbuild/README.md` and
`scripts/place/README.md` (every command), `docs/moxir/TOOLS_MAP_2026-10-05.md` (MOXIR's map and diagnosis;
on branch `aylmo-unpushed/docs/moxir-tools-map-2026-10-05-2026-10-06` until it lands).

## 1. The three rules

1. **Git holds the design.** One git file per fact; scripts generate the rest; the show project is built
   from git. Nothing edits beside it. A browser edit that is not in git is a diff to resolve, not a design.
2. **One show version per production.** The version list's `for-the-show` entry is the only version that is
   built, patched, put on Light and shown. For MOXIR it is **Known · full** (`moxir-hall-known-full`). Every
   other version is archived and private (nothing deleted, undo kept).
3. **The owner runs every server write.** Auto mode refuses agents any write to dev or prod. Do the dry run,
   then give the owner the exact line as `! <command>`. dev.diiii.xyz is the hub; local installs follow it.

## 2. Where each fact lives

| fact | the one source (edit only this) | derived from it (never edit by hand) |
|---|---|---|
| fixtures, positions, aims, looks, cues of each version | `scripts/place/rigs/moxir-versions-2026-10-17.json` + the base rig `scripts/place/rigs/moxir-2026-10-17.json` | `scripts/place/rigs/moxir-2026-10-17-<id>.json` and `.show.json` (by `versions.mjs`), the project document, Light's looks and cues |
| where the cut (truss) hangs | the crane overlay the version names in `craneCut` (MOXIR from 10-07: `moxir-crane-cut-flipped-2026-10-07.json`, on `feat/moxir-truss-flip-2026-10-07` until it lands) | the generated rig file, the hang in the scene |
| hall geometry | `scripts/place/rigs/<venue>-hall-dims-<date>.json` + `-features-<date>.json` | the hall GLB built by `scripts/place/hall.py`; MOXIR's is **pinned** to the 10-02 hall (asset `df837baa`, roof 10.8 m) until after the show |
| fixture types and channel lists | `scripts/place/fixtures/fixtures.json` | `src/rigbuild/types/moxir.json` (by `types.mjs`) |
| maker evidence (status, URL, date) | `src/rigbuild/items/media.json` | equipment cards; ASSUMED modes only in `src/rigbuild/assumedProfiles.js` |
| DMX address and mode | the show's patch plan `scripts/place/rigs/<show>.patch.json` (Known · full's is on PR #766; Minimal's is on dev) | the document's addresses, Light's patch, the patch sheet, MVR |
| equipment list and rental lines | `scripts/rigbuild/rentals/*.json` (written by `versions.mjs` from the quote import) | the equipment page, the order draft |
| prices and vendor choice | the production tables in the private di-atlas repo | nothing public: prices never go on a public page |
| which version is for the show | the version list project `moxir-2026-10-17-versions` (`for-the-show` entry) | the space's published project, which project goes on Light |
| photos, brief, documents | private projects `moxir-sources`, `moxir-brief`, `moxir-documents` on dev | nothing; they stay private (consent and licence) |

## 3. The command for each job

Run from the repo root of a worktree on a `feat/<venue>-<layer>` branch. Nothing in this section writes to
a server unless it says **owner**.

**Regenerate the versions (offline).**
```
node scripts/rigbuild/versions.mjs              # write every version's rig file + rental list
node scripts/rigbuild/versions.mjs --check      # exit 1 when a committed generated file is stale
node scripts/rigbuild/versions.mjs --report <dir> --only known-full   # hang, patch on a throwaway desk, cost
node scripts/rigbuild/types.mjs --check         # fixture types in step with fixtures.json
```
Commit the source change and the regenerated files together. `--check` must exit 0 before a push.

**Rig tests.**
```
npx vitest run scripts/rigbuild scripts/place src/rigbuild
```
Quote the pass line with its count. A gate only counts when the count is above zero.

**Keep a copy before anything replaces a project** (local tier by default):
```
node scripts/rigbuild/copy-version.mjs --api <base>/serverXR --token-file <file> \
  --space <space> --from <id> --to <id>-<label> --label "<what it is>"
node scripts/rigbuild/copy-version.mjs … --undo --to <copy id>     # deletes only that copy
```

**Archive every version but the show one** (`scripts/production/archive-versions.mjs`, on
`feat/moxir-truss-flip-2026-10-07` until it lands). Archive = shelf state `archived` + visibility `private`.
```
# 1. dry run (default): prints the plan, writes nothing — agents may run this against local
node scripts/production/archive-versions.mjs --space moxir \
  --keep moxir-hall-known-full,moxir-2026-10-17-versions,moxir-brief,moxir-documents,moxir-sources \
  --api <base>/serverXR
# 2. owner: the same line + --apply --undo-dir ~/di-backups/<space>-one-version-<date>/
#    (the undo file is written FIRST; each write is read back; exit 2 if a project did not end as planned)
# 3. undo, owner: node scripts/production/archive-versions.mjs --undo <undo-file.json> --api <base>/serverXR --apply
```
A follow does not carry state or visibility yet (di.iiii PR #746 limit), so the owner runs it once per
server: dev, then local.

**Follow and sync (check, then the owner acts).**
```
di follows                                         # every follow on this install, read only
node scripts/tier-sync.mjs --from local --to dev --audit   # compare documents, writes nothing, exit 1 on drift
# owner: di follow <space> --from https://dev.diiii.xyz --into <space>
```
A space that lives on both is followed from dev. Never fix a difference by copying a document by hand: back
up, read both sides, the owner says which wins, then follow. The follow is two-way
(`docs/architecture/SPEC_follow.md`): a local write to a followed space reaches dev.

**Push a page into di.** A page for a followed space goes to **dev, the hub**; the follow brings it to local.
Pushing it to local would make a second, unsynced copy.
```
node scripts/space-code-push.mjs <spaceId> --to https://dev.diiii.xyz/serverXR --dry-run
# owner: the same line without --dry-run (needs LIVE_API_TOKEN)
```
Land the code a page depends on and let dev deploy before pushing the data: an unknown path answers 200 with
the app's own HTML, so a missing file fails silently. Check `content-type`, not only the status.

**Patch and paper.**
```
node scripts/rigbuild/patch-plan.mjs --plan scripts/place/rigs/<show>.patch.json --dry-run
node scripts/rigbuild/patch-sheet.mjs --plan <plan> --out <dir> --pdf     # exit 1 if document drifts from plan
node scripts/rigbuild/export-mvr.mjs --project <id> --out <file.mvr>
node scripts/rigbuild/validate-mvr.mjs <file.mvr>
```
Open the PDF at A4 and count its pages.

**Show clock.**
```
node scripts/rigbuild/show-clock.mjs --api https://dev.diiii.xyz/serverXR --project <id> --check   # read only
# owner: the same line with the epoch set (see the script header), so the hosted show runs
```

**Load a version into a project** (`load-version.mjs`, local throwaway space only; see its header).
Rest a look with `--look <name> --nominal`: a level rested at 0 never comes back.

## 4. Which agent for which layer

The agents are in `.claude/agents/`. Each one reads this file first.

| layer | agent | model | does | the person's part |
|---|---|---|---|---|
| L0–L1 brief, capture | `venue-capture` | haiku | job record, sources, licence, consent, frames | consent, any upload |
| L2 hall | `hall-modeller` | sonnet | three measures, dims JSON, `hall.py`, import | LOOK: hall vs photos; the tape number |
| L3 equipment | `equipment-verifier` | sonnet | maker behind each rental code, status + URL + date | the rental house confirms modes |
| L4–L5 rig and versions | `rig-planner` | opus | `versions.mjs`, refusals, archive dry run | picks the version by looking |
| L6 patch | `patch-planner` | sonnet | patch plan, sheet, MVR | the electrician's power sign-off |
| L7 looks and show | `scene-writer` | sonnet | named looks, show file, cues, clock check | LOOK at each look; laser officer first |
| L7–L9 seen on the surface | `show-check` | sonnet | desktop + phone at DPR 3, GPU proven, screenshots read | LOOK on his own screen and phone |
| L9 paper and order | `rental-and-paper` | sonnet | sheets, crew link, totals, order draft | sends the order |
| L5, L10 safety | `rigging-safety-checklist` | opus | the packet and site checklist, every figure sourced | SIGN: rigging engineer, laser safety officer, electrician |

Order: L0 → L10, each layer's CHECK green before the next. Agents may run in parallel only on different
layers and different files. Read the plan-usage meter before a fan-out.

## 5. Traps already paid for

**Machine and render**
- A headless software-GL render (SwiftShader, llvmpipe) froze the workstation: load 23, CPU 100 °C. Prove the
  GPU renderer string first; stop at 88 °C. `rig-look.mjs` refuses software GL.
- The owner's browser may render on the integrated GPU; measured fps there was 14–19, not the 60 of the
  discrete card. Say which GPU a number came from.

**Data and scripts**
- A project's state used to be "whatever ran last": a re-hang or re-import leaves lamps untyped (no bodies,
  "0 placed", empty patch); `load-plot` deletes the baked wash; `import.mjs --replace` once dropped
  `venuePlan` and reset the night; `realism.mjs` and `apply-picture.mjs` write fog back and forth. Build from
  git instead of patching in place.
- `load-version.mjs` copies the hall from another project, so projects depend on each other. Check which
  hall GLB a project holds before trusting its geometry.
- A new model asset needs `upsertAsset`, or the scene draws nothing.
- A hand merge with `setdefault` added an empty `fixture` to objects that are not lamps. Copy a field only
  when the source has it.
- `PATCH /api/projects/<id>` ignores `state`; the shelf state goes through `PATCH /api/projects/<id>/shelf`.
- Project ids are global across spaces.
- dev's server answers 403 to Python's default User-Agent: send one.
- `scripts/place/` is not packed into a runtime build, so an install's `PLACE_SCRIPT` pointer is load-bearing.
- A probe of `/light/api/show` restarted the running loop. Use read-only endpoints; Light's OUTPUT stays off
  unless the owner says otherwise.
- On 10-05 Light held Minimal's loop plus 241 lamps of 7 other versions, not the show version. Light must hold
  the show version and nothing else.
- `showEpoch` unset on the show version = no hosted show clock.

**Facts and law**
- A Telegram "photo" strips EXIF: ask for files. Record per file whether EXIF survived.
- Photos of people stay private until consent is recorded; the photo project is private on dev for this.
- VGGT weights are CC BY-NC: their use on a paid job is the owner's decision.
- GDTF Share forbids derivative and commercial use: fixture bodies are our own models.
- The maker of the UPlight units publishes no DMX channel orders; every channel list today is a test map,
  marked ASSUMED, until the rental house sends charts.
- Supplier prices are private (di-atlas rule). Rates in public repo files are an open question for the owner.
- A rigging figure (hang height, bridle angle, load per point) is ASSUMED until an engineer gives it. MOXIR
  today: hang 8.15 m vs measured 7.95 m, bridle about 144° against a 120° limit (#772), a tie-off through the
  crane cab, a hazer and a smoke unit outside the end wall, one circuit at 3200 W over 2944 W. None is closed.

**Process**
- Auto mode refuses agents dev writes, `di sync` and `gh pr merge`: hand the owner `! <command>`.
- Footage is the limit of a reconstruction, not the tool: the same 67 frames gave the same roof fragment on
  Colab and locally. Sparse handheld footage needs a slow walk, nobody in frame, exposure locked.
- Commit early: a hard halt once left two commits on one machine only.

## 6. Owed (named, not rounded up)

| owed | where it stands |
|---|---|
| one build command: git → show project as ops, with a diff first (`scripts/production/build-show.mjs`) and a show lock file | designed in TOOLS_MAP §4.3; not built |
| Known · full's patch plan and putting it on Light exactly (`desk-plan`) | PR #766, draft |
| proof that Known · full equals its git rig file | PR #767, draft |
| policy layer (`policy-check.mjs`, venue policy files, waivers) | EVENT_LAYERS §5; not built |
| the flipped cut and the archive script on dev | `feat/moxir-truss-flip-2026-10-07`, not landed; not built onto any server |
| the 144° bridle | #772 |
| the real DMX charts; a real console import of our MVR; the LaserCube driver | waiting on the rental house; never done; branch parked |
| a routing bake-off (which model per agent is better) | not measured |
