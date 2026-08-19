## 2026-08-19 — the one-line install stopped shipping di-studio.xyz, and platform stopped being tangled with works

`curl … /get | sh` handed an artist a 117 MB artifact of which ~10 MB was di.iiii.
The rest was the studio's own website riding along: algovrithm's 31 reels and scan
(88 MB), the wcc microsite (25 MB), and cPanel/OpenGraph furniture that only means
anything on that domain.

The reels were not reached through the algovrithm route. `assetLibrary.js` globs its
own `assets/` folder eagerly and `raw/director/pieces.js` imported that glob — so the
media bin sat in the MAIN graph via the Raw director, a general tool, and was emitted
whether or not anything rendered the piece. That is why the old `--lean` could only
delete `.mp4` files after the build and had to warn that a surface would show missing
media: it was cutting files out from under a graph that still referred to them.

- `DI_PROFILE=local` cuts at the seams the code already has (the glob, the piece's
  asset URLs, its lazy entry points), so nothing is emitted and nothing is left
  pointing at a hole. `public/` became an include-list rather than copy-then-delete.
  **123 MB dist → 9.6 MB. 117.5 MB download → 3.1 MB. 170 MB installed → 70 MB.**
  The hosted build is untouched — verified by serving both shapes.
- A missed cut is now an error, not a quiet full-size build: the transform refuses if
  `assetLibrary.js` stops matching, the packer refuses a dist built under the other
  profile, and `scripts/packProfile.test.js` holds every pattern plus a 15 MB budget
  on the local build — the backstop that needs no list to be right.

**Platform and works, told apart.** 62 of 372 source files in `src/` were two
artworks, and the Raw director imported one of them for its timeline maths, clock,
light model and camera: 13 files, ~1,650 lines. `raw/director/pieces.js` claimed to be
"the only part of the director that knows algovrithm exists" and 13 siblings made that
false.

- The tool moved to `src/timeline/` and `src/hooks/` (editList, clock — was
  `ritualClock`, `useRitualClock` → `useSceneClock` — worldLights and the light
  vocabulary lifted out of the piece's palette with values unchanged, stageView,
  sequenceTransform, dispersionControls, assetPlacement, timingOverlay,
  useAutoHideChrome). The descriptor moved INTO the piece
  (`src/algoVrithm/directorPiece.js`). The director's stylesheet came out of the
  artwork's (`algo-vrithm-director-*` → `di-director-*`).
- `src/works/works.js` is the only file allowed to name a work; `routes.jsx` mounts
  them, always lazily; the offline profile reads the same registry instead of a
  hand-typed list that could go stale in silence.
- **Platform → work edges: 19 → 0** outside the registry, held by
  `src/works/boundary.test.js` (verified by breaking it both ways and watching it
  fail) and warned about at writing time by `scripts/works-boundary.mjs` — on every
  Edit/Write in a session, in the push gate, and via `npm run check:works`. It warns
  and never blocks: "platform or project?" is a judgement call and the answer belongs
  to whoever is building. The rule is in `docs/ai/golden_rules.md` → "Platform and
  works" and in `AGENTS.md`.

**The update method.** An update moves the app and sometimes the shape the work is
stored in; `--rollback` only moved one of them back.

- The health check opens a COPY of the real data now, not an empty `mkdtemp`, and runs
  the migration there before the flip.
- `SCHEMA_VERSION` (`serverXR/src/db.js`) is stamped to `PRAGMA user_version`, and a
  build that cannot read that far refuses the file rather than misreading it —
  `v2_user_is_unrestricted` rewrote `spaces = 'null'` into `'[]'`, which an older
  build reads as "no access to anything", silently.
- A snapshot is taken automatically when the schema moves (`di restore --snapshot`),
  rollback across a schema boundary is refused by name, and `di update` no longer
  walks backwards. `di update --from FILE` finally exposes the USB-stick path the docs
  had promised since the beginning.
- **Every dev → main promotion is tagged**, by `tag-on-promotion.yml`, after the prod
  deploy succeeds. It CALLS `release.yml` — a tag pushed with `GITHUB_TOKEN` does not
  fire `on: push: tags`, so waiting would publish a version with no artifact behind it.

**Work as files (the Blender shape).** The document format already existed — a space
bundle carries the scene, the whole op-log, every project and asset, portable, secrets
stripped — but it had no door on it.

- `di new` / `di save` / `di open FILE` / `di spaces`, and **Save to file** on every
  space card plus **Open a file** beside + Create, backed by
  `GET /api/spaces/:id/bundle` and `POST /api/spaces/bundle`. Both spawn
  `scripts/space-bundle.mjs`: one implementation of the format, because a second one
  in the server would drift quietly, in a file format.
- Extension is `.diiii`; `.space-bundle.tar.gz` still opens. The manifest records
  `writtenBy` and `schemaVersion`, so a file from a newer di.iiii is refused by name
  instead of half-imported, and an unstamped file still opens.
- Where the Blender model stops: a space is LIVE, so there is no unsaved buffer. A
  file is the portable FORM of the work, not where it lives.

Verified by running it, not by asserting it: installed the packed artifact under a
`DI_HOME` with a dot in it and walked the landing, Spaces, Raw and a space (no console
errors, zero external origins); opened the director on a hosted build after moving its
CSS; drove an 0.4.0 → 0.5.0 update with a moved schema through rehearse → snapshot →
refuse-rollback → restore → rollback; saved a space to a file, deleted it, opened the
file back and diffed the scene byte for byte (identical, all 9 ops with it); clicked
Save to file and Open a file in a real browser.

**Still undone, deliberately:** nothing is released. `package.json` is bumped to 0.4.0
but no `v*` tag exists, so `curl … /get | sh` still serves v0.3.1 — the fat, older
artifact. Tag `v0.4.0` by hand after this reaches main (the automatic tagger skips a
commit a human already tagged, and will carry on from 0.4.x). There is also no UI for
`di link`/`di sync`, and a mistyped space URL still lands in an empty 3D void rather
than the "Nothing lives at…" card, because that card lives in `AuthGate` and never
runs when auth is off.

**Suite note:** the test suite has pre-existing order/parallelism flakiness — on plain
`origin/dev` a full run failed `httpContracts` "lets a space owner self-manage their
space"; on this branch a full run failed `PreferencesPage` twice and then passed
clean at 288 files / 2459 tests. Both pass in isolation. Not introduced here, but
worth someone's attention.
