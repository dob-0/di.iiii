# AREA D — data, versions and sync (MOXIR, space `moxir`)

Audited 2026-10-04 (evening, UTC), read-only. Code at origin/dev 7a751cf3 (pack checkout `~/work/di.iiii-pack-7a751cf3`). Sides: dev https://dev.diiii.xyz/serverXR and local https://local.thedi.studio/serverXR. Tokens read from files, never printed; the temporary dev token file was deleted after the run. Writes: none. Raw dumps and scripts are in this folder (`dump/`, `versions-audit.out`, `assets-res.json`, `space-assets.json`, `PROVENANCE.md`).

## What is clean (CONFIRMED)

- Projects: dev and local both hold the same 25 projects (`GET /api/spaces/moxir/projects`: 25 and 25, none only on one side). 19 version projects + `moxir-2026-10-17-versions`, `moxir-documents`, `moxir-brief`, `moxir-sources`, `moxir-truss`.
- Content: all 25 have the same normalised fingerprint on dev and local. I used the repo's own `fingerprintOf` (projectMeta stamps ignored, assets by name). The entity counts match too.
- Assets: 300 asset records on each side. All 300 answer 206 with the token on dev AND on local (none missing). Names, sizes, MIME types and even asset ids are identical on both sides for all 300. A scan of every project document for 64-hex ids found no reference to an asset that is not in that project's asset list. The one hit is a text note in known-full, "hall asset 4b0d561f…", which is not a reference.
- Version list: 19 entries on dev and 19 on local, the same list. Each entry matches its project and fingerprint, so there is no "edited since listed" note. Status counts: for-the-show 1 (`known-full-ponyo-10-04` -> `moxir-hall-known-full`), candidate 9, kept-copy 7, archived 2. No project carries a version mark without being in the list.
- Follow: `di follows` on aylmo reads `moxir  https://dev.diiii.xyz  following · in 0 · out 0 · 26 logs`. Over a few minutes it read "in 180", then "starting · in 0", then "following · in 0 · out 0". The 180 pending ops were carried and the queue is empty.
- Real order: `~/Downloads/rig-equipment/moxir-hall-equipment.csv` has sha256 9dc3620b…4310, the same as its PROVENANCE row. The A4 pdf has ccb83227…, the same as its row and its asset id.
- Privacy of the four private projects (dev, no token): `GET /api/projects/{moxir-documents|moxir-brief|moxir-sources}` and `/document` return 404 "Project not found". The versions list `/document` returns 404. Asset URLs of those projects return 404 (sampled 13 of `moxir-documents`, 13 of `moxir-sources`, 11 of `moxir-brief`; the 2 other brief probes got 429). The space file route `/api/spaces/moxir/files` returns 404. `/api/spaces/moxir/assets` returns `{"assets":[]}`. The project list shows a visitor 21 of the 25 projects, so the four private ones are hidden. PROVENANCE's claim "a visitor gets 404" is true for what I sampled.

## Findings

### D1 — wrong-vs-real / gap (HIGH, CONFIRMED): the for-the-show version has no rebuild path from git
`moxir-2026-10-17-versions` document, entity `version-known-full-ponyo-10-04`: `madeFrom: null`, `madeBy.install: "another install — the copy's label: \"PONYO 10-04\""`, `tool: "copy-version.mjs --from-api"`, `commit: null`, fingerprint `sha256:3d64a1bc…79a7`. The project `moxir-hall-known-full` was brought from PONYO under the same id (dev createdAt 2026-10-04T18:07:46Z, local 19:30:57Z, documentVersion 1 on both). The rig file `scripts/place/rigs/moxir-2026-10-17-known-full.json` exists in git (last commit c8bc566f, 21:52 +04, the 6 LaserCube change), but no record says the project equals it. I did not run a build or a diff (heat rule), so whether the two agree is unknown. The project does have the 6 LaserCubes (`rig-lasercube-cut-01..06`), so at least that commit is in it.
Why it matters: "what we see now we will see in real life" needs the show to come from checked-in, pinned source. As it stands, the only origin of the chosen setup is PONYO's install. I did not check PONYO (rule: no ssh there).
Fix: run the rig build for known-full and compare its fingerprint with 3d64a1bc. If they are equal, record `madeFrom` (rig file + blob). If not, decide which wins. Pin it in the list.

### D2 — gap (medium, CONFIRMED): the audit tool fails (exit 1) on 3 names, so it can't gate the show
`node scripts/production/versions-audit.mjs --production moxir-2026-10-17 …` prints "3 mismatches across dev and local and git". `scripts/place/rigs/moxir-versions-2026-10-17.json` (the `ordered` key and the `candidates`) names `ordered`, `known-full` and `known-ground`. The list holds `ordered-live-lamps-09-29`, `known-full-ponyo-10-04` and `known-ground-ponyo-10-04`. Dev and local agree with each other, so this is only a code-vs-list naming drift.
Why it matters: the check meant to run "before the show" is red forever. A real failure would hide among these three.
Fix: rename the list ids or the code ids so they agree (or let the tool read the suffix). Put the audit in a script that fails on anything else.

### D3 — wrong-vs-real (medium, CONFIRMED): the space's front door publishes `moxir-hall-minimal`, not the chosen version
`GET /api/spaces/moxir` on dev (no token): `"publishedProjectId":"moxir-hall-minimal"`. Local gives the same. A visitor who opens /moxir gets Minimal, while the owner chose Known · full.
Why it matters: the show crew or a guest opening the plain link sees a different rig from the one that will be built.
Fix: after D1, set the published project to `moxir-hall-known-full` on dev and local.

### D4 — gap (medium, CONFIRMED): visibility is not synced, and the two sides differ
- Project `moxir-sources` (hall photographs): dev `private`, local `public`.
- Space `moxir`: dev `isPublic:true`; local `isPublic:false`.
Cause: follow does not carry visibility (known limit in the owner's CLAUDE.md, PR #746). The local copy is behind the aylmo gateway (passcode), so the exposure is low. But the two sides disagree on which one is private.
Fix: decide the rule once, set both, and re-check. A rule in `di follows` or the audit would catch it.

### D5 — gap (medium, SUSPECTED-leaning-confirmed): the chosen version is in no backup I can see
Newest installed-di backup is `~/di-backups/tier/dii-backup-2026-10-04_1128.tar.gz` (made 15:30 +04 = 11:30Z, ok per `~/di-health/tier-backup.md`). `moxir-hall-known-full` first reached dev at 18:07Z and local at 19:30Z, so it is newer than every backup on aylmo. I do not know dev's backup state (the VPS note says offline/unpaid) or PONYO's.
Fix: run the backup after the version settles, and say where dev's backup lives. The `moxir-to-dev-2026-10-04` copy in `~/di-backups` predates it too (I did not open it).

### D6 — gap (medium, CONFIRMED): maker documents for the real gear are mostly stand-ins, and 12 of 30 items have none
`src/rigbuild/items/media.json` (origin/dev): 24 documents, all 24 are stored in the space (asset id = sha256) and in `moxir-documents`. But 18 of 24 are marked `equivalent: true` (other makers' products: Aolait, SHEHDS, YUER, MagicFX, Antari, Chauvet Obey 70, ChamSys, ENTTEC, LTECH, ETC, Luminex, Global Truss, Prolyte). Only the MDG ATMe hazer's 6 documents are the maker's own. 12 of 30 items hold no document at all: up-b380f, up-pl5403, up-cob200, up-la40wf, up-by06, up-jg400, up-sw3000b, up-236, up-hd210, up-q3l, up-9800, up-b01. UP-B380F (18 ordered) and UP-250BSW (12 ordered) lead the order CSV, both flagged `channels-owed`.
Why it matters: the "real gear" bar for DMX channel counts and modes is met by stand-in charts or by nothing. Only the rental house can close it. The media note itself says the stand-in chart is "NOT the rental unit's; not applied to the patch".
Fix: the owed rental questions (`patch--questions-for-rental.md` is in moxir-documents). Until answered, mark those fixtures "channels unconfirmed" in the version.

### D7 — gap (medium, CONFIRMED): dev's space file store is empty, local holds the 24 manuals
`GET /api/spaces/moxir/assets` with token: dev 0 files, local 24 (all 24 media.json ids present locally, 0 of 24 on dev). The rig builder's item cards fetch `/api/spaces/{space}/assets/{asset}` (media.json `store.route`), so on dev those cards have no files. The same 24 PDFs are inside the private `moxir-documents` project on dev, so nothing is lost, only the route. Follow does not carry space files.
Fix: either upload them to dev's space store, or make the item cards read the project copy. Decide which machine runs the show: this affects whether the cards work.

### D8 — gap (low-medium, CONFIRMED): PROVENANCE.md is complete by name, but 24 image rows record the original's sha and size, not what is stored
`moxir-documents` asset `PROVENANCE.md` (69,010 bytes, 137 rows). Every one of the 133 stored assets has a row (0 unnamed). 4 rows are "not added — same sha256 as …" by design. Licence and source columns are filled, and no row says unknown. But 24 rows (the visualiser stills, show-*.jpg, scan-views, scan previews, crush png) carry a sha256 and byte count that differ from the stored asset. Example: `show--crane-live-2-sheet.jpg` row 451,850 bytes sha a11bd039…; stored asset 225,262 bytes id 445e250d…. The upload route re-encodes images. The status says "already in this project", so a reader cannot match the sha to the stored file. Also: the 24 manual rows say "held as a SPACE file on the installed di" (true locally only, see D7). The 10-02 measured hall (`moxir-hall-dims-2026-10-02.json`) is not in `moxir-documents`; it lives in git only.
Fix: add `stored sha256 / bytes` columns (or a note that images are re-encoded). Add the 10-02 hall files and `moxir-hall-dims-2026-10-02.json`.

### D9 — cosmetic / suspected (low): old-hall data in versions not marked "oldhall"
Hall mesh asset by version (dev): `moxir-hall-known-full` has `hall-night.glb` df837baa (found in no other project). `known-ground` and `minimal-halo(-heads)` carry `hall-night.glb` c8678444, the same file the `*-oldhall-0929` copies carry. SUSPECTED that these candidates still sit on the pre-10-02 hall (I did not open the mesh or compare it with the measured file). The owner is turning them into concepts, so low.
Fix: if wanted, name them or relabel them.

### D10 — cosmetic (low, CONFIRMED): clutter and open flags
- `moxir-truss` ("Truss over the DJ") is public and empty (0 entities), not in the list. It is readable by a visitor.
- 3 archived projects (`moxir-hall`, `-full`, `-middle`) are still public and a visitor can read them.
- `allowEdits:true` on a public dev space. It is the owner's kill switch, not a proof of anonymous writes. I did not test writes, and whether a visitor can write is unknown.
- Anonymous requests are rate-limited. My probe of ~600 requests (8 at once) got 429 for 167 + 105 anonymous asset requests, while token requests were never limited. The threshold is unknown. A hall full of visitors behind one IP may hit it (SUSPECTED).
- Local `documentVersion` is far higher than dev's (e.g. `moxir-hall-minimal` dev v6, local v877; `moxir-hall` dev v1, local v2379). Edit history lives on aylmo only. Content is equal.

## Only on one machine (summary)
- Only local: the 24 space files (D7); the full edit history (D10); the public flag on moxir-sources (D4).
- Only dev: space `isPublic:true` (D4).
- Only on PONYO (not checked): the origin of known-full (D1).

## Not checked
PONYO; dev's own backups; whether `moxir-hall-known-full` equals the rig file (D1); anonymous write access; local seen from outside aylmo (gateway); the `moxir-brief` content (private; not opened).
