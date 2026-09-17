# Spaces audit — every space, three copies

Verified 2026-09-16, 14:45–15:30 UTC. Read-only: nothing was written to any tier.
Spend: one agent (Opus 5), about 45 minutes of reading.

The three copies:

- **local**: your machine. `http://localhost:4000/serverXR`, database `~/.local/share/di.iiii/data/di.db`
- **dev**: `https://dev.diiii.xyz/serverXR`
- **live**: `https://di-studio.xyz/serverXR`

## Verdict

There are 32 named spaces. 12 hold the same work on local and dev. Nine have been
changed in different places. Nine exist on one copy only: eight on your machine,
one on dev. Most of the mess sits in a few places. `open` and `wcc` on local are
full of archived copies. There are test and scratch spaces that nobody cleared. The
live front room still has the 76 stray pictures. And live has fallen behind dev on
`br-id-ge`, `dilijan`, `main` and `library`. Nothing has been lost, but three
things need you soon. First, three live spaces will delete themselves in about 24
days unless someone marks them permanent or writes to them: `network` with its 67
rooms, `cascade` and `the-light-put-back`. Second, live's library page links 51
PDFs that aren't on live. Third, the record that tells a sync which side changed
last matches **0 of 131** projects, so a careful sync (`--changed`) will refuse
everything until that record is rebuilt. Only a handful of pulls from dev to local
are safe right now. Everything else is a decision for you, listed below.

## One row per space

State compares **local with dev** by content, not by timestamp. Anything about live
is in the "mess found" column. Numbers are project counts: local / dev / live.

| space | local | dev | live | state | mess found | recommendation |
|---|---|---|---|---|---|---|
| algovrithm | 0 | 0 | 0 | same | empty on all three by design (the room is code in `src/algoVrithm/`) | keep as is |
| atlas (private) | 2 | 2 | 1 | same | live lacks `links` (1.2 MB page) | keep as is; live is owner decides |
| azd | 1 | 1 | 1 | both changed | local page differs by 74 characters; dev and live agree with each other; local is not permanent | pull dev→local after a look |
| beyond-form | 1 | 1 | 1 | same | on live, owned by Emilya's account | keep as is |
| br-id-ge | 74 | 74 | 4 | both changed | `landing`, `newww`, `br-id-ge-field`: three different versions, dev newest (v99/v148/v86, 09-16); `n2-hub` newer on local (v4 09-10 vs v1 09-01); 70 projects not on live; 5 same-title entries (`n2-hayfilm` to `-5`, `n2-algovrithm`/`-2`, `n2-calling-back-nature`/`-2`, `n2-objects-and-meanings`/`-2`); `newww` points at 3 videos from a project that exists nowhere (`br-id-ge-teaser-2026-v1`) | pull the 3 pages dev→local; push `n2-hub` local→dev after review |
| cascade | 1 | 1 | 1 | same | pictures re-addressed only; **not permanent on all 3 copies** (live has about 24 days left); local marks the published `club` as *archived* | keep; owner decides (set permanent) |
| decisions (private) | 1 | 1 | 1 | same | — | keep as is |
| di-i-the-studio (private) | 0 | — | — | one tier only | empty shell, created 09-10 | delete candidate |
| di-iiii-everywhere-the-rig (private) | 1 | — | — | one tier only | new page, edited today (v6) | keep; push local→dev after review |
| di-laser (private) | 1 | 1 | — | both changed | dev v1 is 1,291 characters longer than local v12, both 09-15; local has no published project, dev publishes `di-laser` | owner decides |
| dilijan | 23 | 23 | 19 | same | live is missing `camp`, `console`, `desk`, `elevation`; 12 pages differ on live (`tsaghkanots` is 20.6k on live vs 7.3k on dev) | keep as is; live is owner decides |
| drum-rhythms | — | 2 | — | one tier only | dev only, public, not permanent (09-11) | pull dev→local |
| emily | 4 | — | — | one tier only | Emilya's WCC landing v1/v2/v3 plus a demo room, rebuilt here 09-10 01:00–01:09; 3 of 4 archived | owner decides (see Emilya's footprint) |
| festival-test (private) | 1 | 1 | — | same | test space (`lights-test`, 6 entities) | archive candidate |
| funding (private) | 2 | 2 | 1 | same | same content, but local publishes `funding-board-v2` while dev and live publish `funding-board` (local marked it archived) | owner decides which board is the front |
| hosq (private) | 4 | 4 | — | same | local not permanent | keep as is |
| kids | 1 | — | — | one tier only | one project, "360 Cinema (Emily, 1 Aug)"; **all 8 of its videos return 404** | owner decides |
| lab (private) | 3 | — | — | one tier only | 3 VJ sketches 09-14; 1 more in the trash | archive candidate |
| library (private) | 1 | 2 | 1 | newer on dev | `di-library` on dev is v13 09-10 (868k); local equals live (452k); `di-multimedia` is on dev only; **on live, all 51 PDFs in the library return 404** | pull dev→local |
| main (`di.iiii`) | 9 | 8 | 4 | both changed | **live front room still has the 76 stray images (85 entities vs 9)**; `suite` is three different versions, and the repo declares it; `space-inventory` and `tier-compare` exist on local only; `tools-sketch` is in local's trash but live on dev; local `brand-guide` slug is `brand` where the repo says otherwise | owner decides |
| network | 68 | 68 | 67 | both changed | 6 rooms differ by 3–8 characters on all 3 (Alla, Ani K., Jeny, Margarita, Meri, Nush); local label is still `network` where it should be `The network`; `network-index` is not on live; **live `network` is not permanent (about 24 days left)** | re-apply the repo manifests per copy; fix the label |
| node-examples (private) | 8 | — | — | one tier only | 8 node example rooms, busy (v679 on 09-15) | keep; owner decides whether dev gets them |
| open (Open Space) | 6 | 8 | 3 | both changed | `open-jam` is three different versions (26 / 25 / 22 entities); `mini` and `i-dont-know` are in local's trash since 09-10 (the 09-02 decision was to keep them); five front-room/look copies (`front-room`, `front-room-light`, `look-night`, `look-paper`, `look-signal`) carry 76–78 images each that don't load; local calls the space kind `global`, dev and live say `normal` | owner decides |
| open-calls-a-working-board (private) | 0 | 0 | — | same | empty shell on both | delete candidate |
| platform-recordar | 1 | 1 | 1 | both changed | same counts (39 entities, 23 assets), content differs on all 3, no baseline; dev not permanent | re-apply from `dob-0/platform_recordar` |
| queerlab (private) | 1 | 1 | — | same | local not permanent | keep as is |
| test-desk (private) | 2 | — | — | one tier only | `test` (v1374), `wall` is empty (v0, created today); 2 more in the trash | delete candidate (check who made `wall` today first) |
| the-light-put-back | 1 | 1 | 1 | both changed | dev and live agree; local v15 differs (same page length); **not permanent on all 3** (live has about 24 days left) | owner decides (set permanent; look at local's v15) |
| the-model-arena (private) | 1 | 1 | — | same | — | keep as is |
| the-system (private) | 1 | — | — | one tier only | one page, 09-10 | owner decides |
| wcc | 15 | 11 | 11 | local ahead | local has 4 extra *archived* copies; `main` and `jeny-gevorgyan`: local and dev are the same, **live is newer (08-21), Emilya's white variant**. Local's `main-prod-white-variant` has the same 20 entities as live `main` | owner decides |
| what-we-have (private) | 5 | 5 | — | both changed | `map` newer on local (v53, 6 nodes vs 0); `r-di-led-panel` newer on dev (09-16, 1.57 MB vs 1.04 MB); `loose-files` differs; `names` on local only; `suite-sketch` in local's trash, live on dev | owner decides |

Hidden from every list: guest and account sandboxes. There is 1 on local
(`sandbox-d5e851f9d8284645`, 07-18), 6 on dev and 3 on live. The API gives only
the counts, so this audit did not read what's inside them.

**Counts per state:** same 12 · newer on dev 1 · local ahead 1 · both changed 9 ·
one tier only 9 (8 local, 1 dev).

Project level, from `tier-sync --audit`:
- **local ↔ dev:** 27 only on local, 7 only on dev (5 of those are in local's trash), 22 different, 6 the same with pictures re-addressed.
- **dev ↔ live:** 102 only on dev, 0 only on live, 31 different, 3 re-addressed.

## Decide first

Nothing below has been done. Each item is a choice, and the evidence is attached.

1. **Three live spaces are on the 30-day delete clock.** `pruneSpaces` deletes any
   non-permanent space not written to for 30 days (`serverXR/src/spaceStore.js:179`),
   and reading a space doesn't reset the clock.
   - live: `network` (last written 09-11), `cascade` (09-10), `the-light-put-back` (09-10). About 24 days left.
   - dev: `cascade` and `the-light-put-back` (09-02, about 16 days left), `what-we-have`, `platform-recordar`, `drum-rhythms`, `di-laser`, `br-id-ge`.
   - local: 18 spaces, including `azd` (about 15 days left) and `the-light-put-back` (about 17).

   The fix is one admin PATCH per space (`permanent: true`), which is your hand.
2. **The live front room still carries the 76 stray images.** live
   `main/main-dii-project` is v163 with 85 entities (76 of them images). Local and dev
   are v166 and v238 with 9 entities, and their documents are identical. Carrying the
   cleanup to live is a production write.
3. **Which WCC `main` is the real one?** live `wcc/main` is v1982 (08-21), authored on
   live, and matches local's archived `wcc/main-prod-white-variant` entity for entity.
   dev and local `wcc/main` are v1937 (08-06). `wcc/jeny-gevorgyan` is the same story
   (live v187, 08-21). You said "take and keep" for Emilya's WCC work. Nobody has
   decided which version that means.
4. **Open Space.** `open-jam` is three different versions:
   - local: v1606, 26 entities
   - dev: v5131, 25 entities
   - live: v5100, 22 entities, with a video and 3 fewer texts

   On local, `mini` and `i-dont-know` were put in the trash on 09-10. The trash empties
   after 30 days, so they go around 10-10, although the 09-02 note says keep. They are
   still whole on dev and live. Restoring them would be a local write:
   `POST /api/projects/<id>/restore`.
5. **Clutter to archive or delete.** Nothing is removed without your word:
   - empty shells: `di-i-the-studio` (local), `open-calls-a-working-board` (local and dev), `test-desk/wall`
   - test and scratch: `test-desk`, `lab`, `festival-test`
   - design copies whose images don't load: `open/front-room`, `front-room-light`, `look-night`, `look-paper`, `look-signal` (archived on local, live on dev)
   - archived WCC copies on local: `dob0-hub-portal-ring`, `emily-v2-arc-of-panels`, `main-prod-white-variant`, `artists-works-page-snapshot`
   - local trash, 11 projects: `lab/led-panel-wiring`, `test-desk/design-audit`, `test-desk/preview-check`, `what-we-have/suite-sketch`, `main/tools-sketch`, `open/i-dont-know`, `open/mini`, `wcc/emily-v1-framed-entry`, `wcc/landing-page-snapshot`, `wcc/prod-main-white-variant`, `wcc/dob0-hub-and-ring`
6. **Live's library is broken.** live `library/di-library` lists 51 PDFs and every one
   answers 404. dev has the 868k version (v13) and its files load.
7. **Three copies of `main/suite` and six `network` rooms.** The repo declares all of
   them (`spaces/main`, `spaces/network`). The fix is to re-apply from the repo, one copy
   at a time, with `--dry-run` first. Don't hand-sync these.
8. **`funding`'s front page.** local publishes `funding-board-v2`. dev and live publish `funding-board`.
9. **`di-laser`, `what-we-have`, `the-light-put-back`, `azd`, `platform-recordar`.**
   Content differs, and nothing can say which side is newer (see "the baseline is stale"
   below).

## Safe to sync

These write to **local only**. Every one was checked: the local copy holds nothing
that isn't also on dev or live, or local hasn't been touched since dev moved on.
Back up first: `cp ~/.local/share/di.iiii/data/di.db ~/di-backups/di.db.2026-09-16`.
Run from a di.iiii worktree with its `serverXR/.env.local`.

The dev address in `serverXR/.env.local` (`LIVE_API_URL=https://staging.di-studio.xyz/...`)
**doesn't resolve any more**, so pass the dev address explicitly:

```bash
export LIVE_API_URL=https://dev.diiii.xyz/serverXR
T="--to http://localhost:4000/serverXR"

# 1. the space dev has and local lacks, plus the network label ("network" → "The network").
#    local-mirror only creates and relabels; it leaves existing projects alone.
node scripts/local-mirror.mjs --space drum-rhythms --space network $T --dry-run
node scripts/local-mirror.mjs --space drum-rhythms --space network $T

# 2. library: dev is newer, and local is identical to live, so nothing is lost
node scripts/project-pull.mjs di-multimedia --space library --from $LIVE_API_URL $T --dry-run
node scripts/project-pull.mjs di-multimedia --space library --from $LIVE_API_URL $T
node scripts/project-pull.mjs di-library    --space library --from $LIVE_API_URL $T --force

# 3. br_id_ge pages built from dob-0/br_id_ge; dev is the newest (09-16), local's last touch was 09-02/09-07
for p in landing newww br-id-ge-field; do
  node scripts/project-pull.mjs $p --space br-id-ge --from $LIVE_API_URL $T --force
done
```

After a quick look, not blind:
- `azd/azd` (dev and live agree; local is the odd one out): `node scripts/project-pull.mjs azd --space azd --from $LIVE_API_URL $T --force`

Local → dev, only after you've looked (these would be dev writes):
- `br-id-ge/n2-hub` (local v4 09-10 vs dev v1)
- `what-we-have/map` (6 nodes local-only)
- `di-iiii-everywhere-the-rig`

**Don't use `tier-sync --changed` yet.** The baseline needs rebuilding first.

## Emilya's footprint

| where | what | local | dev | live |
|---|---|---|---|---|
| account | `emilyanikoghosyan`, admin, scope `wcc`, `beyond-form` | `emilya`, editor, scope `main` | none of 3 users | yes |
| `wcc` space | owner on live (`ownerUserId f2d566f6…`) | owner null | owner null | owner = her |
| `wcc/main` | the white variant | v1937 (08-06) | v1937 | **v1982 08-21, hers, differs** |
| `wcc/jeny-gevorgyan` | artist room | = dev | v170 | **v187 08-21, differs** |
| `beyond-form/open-call` | owner on live | same | same | same |
| `emily` space | WCC landing v1/v2/v3 plus a demo room (09-10) | 4 projects | — | — |
| `kids/360-cinema-…-emily-1-aug-2026` | 71 entities, 8 videos, all 8 return 404 | yes | — | — |
| `wcc/emily-v2-arc-of-panels` (archived), `wcc/emily-v1-framed-entry` (in local's trash) | lost drafts | yes | — | — |
| `network/network-emilya-nikoghosyan` | her CV room | v25 | v15 | v5, identical on all 3 |

`algovrithm` (her space from the fork) is an empty space on all three copies. That is
correct, because the room is code. The two `br-id-ge/n2-algovrithm*` entries are
Notations submissions, not her space. Every trace of her outside `wcc`, `beyond-form`
and `network` lives on local only.

## Other findings

- **The baseline is stale.** The file `<DATA_ROOT>/tier-sync-baseline.json` (09-06, key `staging`, 131 entries) matches **0** of the 108 projects that local and dev currently agree on, so the way a document gets fingerprinted has changed since it was written. Every `--changed` run will refuse every difference as "changed on both sides". Rebuilding it is a local write, done by a `--changed --dry-run` run, which writes the baseline even in dry-run mode.
- **`start-check` over-reports.** It reads timestamps, not content. It printed 94 `NOT LATEST` lines, 67 of them `network` rooms, and 61 of those rooms are identical in content. It also printed 63 "local changes not yet on dev" lines for `br-id-ge` projects that are identical in content. The real local↔dev content differences number 22. It also says to pull `open/mini`, `open/i-dont-know`, `main/tools-sketch` and `what-we-have/suite-sketch`, which would bring back projects someone put in the trash on local on purpose.
- **Links that don't load.** Checked: 1,516 listed assets plus every asset address found inside pages.
  - `br-id-ge/newww`: 3 videos, on all 3 copies (the teaser project they point at doesn't exist).
  - live `library/di-library`: 51 PDFs.
  - live `open/open-jam`: `scan.glb`.
  - `kids`: 8 videos, local.
  - `test-desk/test`: 1, local.
  - the five front-room/look copies: 76–78 images each.
  - Everything else resolves. `di-laser`'s 42 photos load from `the-light-put-back`.
- **Local API vs database.** The API lists 31 spaces and 239 projects. The database holds 32 and 250. The difference is the sandbox and the 11 trashed projects.

## Method

All reads, with tokens from `/home/dob/work/di.iiii/serverXR/.env.local`. Worktree `docs/spaces-audit` off `origin/dev`.

```bash
# the repo's own tools
node scripts/tier-sync.mjs --from local --to dev  --audit    # LOCAL_API_URL=http://localhost:4000
node scripts/tier-sync.mjs --from dev   --to prod --audit
node scripts/tier-sync.mjs --from local --to prod --audit
node scripts/spaces-audit.mjs
node scripts/start-check.mjs --spaces-detail
node scripts/local-mirror.mjs --tier all --dry-run --to http://localhost:4000/serverXR   # LIVE_API_URL=https://dev.diiii.xyz/serverXR
node scripts/project-pull.mjs <id> --space library --from https://dev.diiii.xyz/serverXR --dry-run

# a GET-only collector (session scratchpad): every space row, every project row, every
# document → tier-sync's own documentSignature() (hash + asset-name shape) plus entity-type
# counts; then GET .../assets/<id>/meta for all 1,516 listed assets and every in-page asset id
GET /api/spaces · /api/spaces/:id/projects · /api/projects/:id/document · /api/trash · /api/users (owner names only)

# local database, read-only
sqlite3 -readonly ~/.local/share/di.iiii/data/di.db "select … from spaces" / "… from projects where deleted_at is not null or state != 'live'"
```

- "Which side moved" was meant to come from the baseline. The baseline turned out to be stale, so it rests on agreement across three copies and on `documentVersion` and `updatedAt`.
- Nothing was blocked. `staging.di-studio.xyz` doesn't resolve, so dev was read at `dev.diiii.xyz`.
- No process showed an open handle on `di.db`, so the database the local stack reads was confirmed by matching the API against sqlite: 31+1 spaces, 239+11 projects.
