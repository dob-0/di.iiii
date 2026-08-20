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

**Suite note, corrected.** I first read the `PreferencesPage` failure as part of the
suite's flakiness. It was not: the test asserted the literal string `0.2.0`, so it was
really asserting that nobody had touched `package.json` — and it broke the moment the
version was bumped to 0.4.0 in this branch. It reads `__APP_VERSION__` now. CI caught
it, having run the full suite on a clean checkout, which is exactly what a local
"passes on the third try" reading could not.

What IS pre-existing: a full run on plain `origin/dev` failed `httpContracts` "lets a
space owner self-manage their space", with nothing of this branch in the tree. That
one passes in isolation and is worth someone's attention separately.

## 2026-08-19 (later) — two bugs that only a real install could show

Installed for real at `~/.di` and put di-library, di-funding and di-atlas into it.
Both of these were invisible on staging, on prod and in the whole suite, and both
turned up within ten minutes of using it as an artist would.

- **Every uploaded asset 404s on a `di` install.** `res.sendFile(absolutePath)` makes
  `send` apply `dotfiles: 'ignore'` to every segment, and the install home is `~/.di`.
  The upload returns 201 with a URL and that URL is dead. Already found once for
  `index.html` and fixed there; the identical line survived in the project asset
  route because nothing exercised it from a dotted path. The guard now has a dot in
  it — `startServer({ hiddenDataRoot: true })`.
- **The upload rate limiter counted the one person using it.** 60 per 10 minutes,
  written for a public address, applied to loopback with auth off. The library push
  died at file 60 with "retry in 587s". Every limiter is exempt on `DI_LOCAL=1`;
  hosted keeps all of them.

Also worth knowing for anyone doing this next: `di up` treats a healthy port as
"already running", so a server left over from a previous install — one whose files
have been deleted out from under it — is indistinguishable from the real one. It
looked exactly like a working install writing to a database that no longer existed.
Not fixed here.

## 2026-08-21 — which di.iiii is this?

Two di.iiii that render identically are two di.iiii you will eventually
confuse, and that confusion has already cost work: di-library published a PROD
page whose 51 PDFs every one 404'd, because an asset cache written against
STAGING looked correct on screen and asset ids are per-server. The address bar
always held the answer; nothing on the page ever did.

- `src/utils/deployMode.js` — pure, **hostname-first**. Loopback, private v4,
  `.local`, and any name with no dot (a LAN or tailnet machine) read local;
  a first label starting `staging` reads staging; everything else is the live
  site. Hostname first because the answer has to be right on the FIRST paint —
  a mark that changes its mind once a request lands is a mark nobody trusts.
- The server's `local` flag still wins when it has spoken. A `di up` install
  reached over a tailnet name (`aylmo.tail1234.ts.net`) is indistinguishable
  from a public host by address alone, and that is exactly the case where being
  told "hosted" would be a lie. Read from `/api/config`, never
  `/api/auth/session` — learning where you are must not mint a guest session
  for someone who only opened a public space.
- `ModeMark` (mounted once in `RootApp`, so there is nowhere in di.iiii you can
  stand and not know where you are): a 2px frame at the viewport edge plus a
  mono chip bottom-left with the mode and the host. **Local green `#4df9c0`,
  staging amber `#ffb347`, hosted nothing at all** — existing tokens, no new
  colours, and the live site renders exactly what it rendered before, so an
  audience sees no chrome that was not already there.
- `z-index: 10001`, above the loading screen (9999) and the auth notice
  (10000): "which di.iiii is this" must be answerable in the half-second a
  surface is still black, which is precisely when someone types into the wrong
  one. `pointer-events: none` throughout — it tells you where you are, it is
  not a control.
- Suppressed inside an iframe and under `?preview=1`: Studio space cards render
  the app as a thumbnail, and a frame drawn inside every card is noise rather
  than an answer.
- The `getServerConfig()` call is wrapped in try/catch, not only `.catch()`.
  This overlay sits above the entire app, so anything it throws synchronously
  takes every surface down with it — which is not hypothetical: it is exactly
  what happened to all 12 `RootApp` route tests the first time it ran against a
  mock that had no `getServerConfig`. A decorative mark that can kill di.iiii
  is worse than no mark.

Seen, not asserted: screenshotted on the landing page, Studio, Raw and a 3D
space of a REAL packed install (`di-runtime-0.4.0.tar.gz`, scratch `DI_HOME`,
port 4100) with a live backend and zero console errors; on a 390px phone
viewport at DPR 3, where the address drops and the badge stays; and on all
three tiers by mapping `staging.di-studio.xyz` and `di-studio.xyz` to 127.0.0.1
in Chromium, confirming amber, green, and — on the live hostname — no element
in the DOM at all.

**Deliberately not done:** the accent itself is untouched. Repainting the UI
green would mean folding **261 hardcoded `#4df9ff` / `rgba(77,249,255,…)`
literals across 22 files** into `var(--di-cyan)` first (155 uses already go
through the token), or the app ships half-repainted. That is its own reviewable
chore — identical hosted pixels before and after — and the token flip becomes
one line once it is true.

## 2026-08-21 (later) — the SDK: one core, and a gate on the doors

Three projects in this studio each hand-rolled their own way to talk to di.iiii
— 241, 103 and 101 lines doing the same eight moves. All three re-derived the
same traps; two of them got a token by reading
`/home/nooo/di.iiii/serverXR/.env.local` **by absolute path**, which is a
project depending on the platform's working tree — the exact boundary this
branch spent a day drawing. And an agent calling the same API knew none of it.

`sdk/` is that written once. Fourteen moves, three faces: a library
(`connect()`), an MCP server for Claude (`sdk/mcp.mjs`, `di mcp`), and — not
yet — the CLI, which predates the core and is its own change. `sdk/README.md`
says so rather than claiming three.

**Reach is the safety model, and it is one word per move.** `read` shows
nothing to anyone new, `private` writes where the caller can already reach,
`public` opens a door. Public moves are refused unless something explicitly
confirmed them, and **a refusal never touches the network** (guarded: the fake
server records zero requests). Reach can depend on the arguments —
`space.ensure` is private, `space.ensure({isPublic:true})` is not — because a
reach read from the name alone can be walked straight past. Closing a door
never asks; only opening one does.

**No confirm means refused, not performed.** An agent holding a token with
nobody watching must not publish by omission. Over MCP the default is harder
still: public moves are refused outright unless whoever launched the server set
`DI_MCP_ALLOW_PUBLIC=1`, and even then each call needs `confirm: true` — the
decision to let an agent publish is made once, by a person, outside the
conversation that would ask for it. The honest limit is in the README: once
that flag is on, nothing stops a model confirming itself; what it buys is that
the intent is in the transcript. The hard guarantee is the default.

**Six traps stopped being comments and became code:** a space id comes from the
LABEL (mismatch refused by name); asset ids are per-server (cache keyed by host,
plus one HEAD before trusting a cached run — the failure it prevents is a page
that loads perfectly with all 51 PDFs dead); `PUT` normalises silently (read,
merge, write, read back, compare byte for byte); **202 is not success** but an
armed approval gate; a token-created space belongs to nobody; and everything is
born `permanent: true` or the 30-day sweep eats it.

`sdk/credentials.js` exists so the `.env.local`-by-absolute-path habit has
somewhere to go: `DI_TOKEN`, then per-tier, then `~/.config/di/credentials.json`,
**never a repository**. Loopback needs no token — a `di up` install runs with
auth off, and demanding one would break the SDK exactly where it is safest.

Two things this turned up that were nothing to do with the SDK:

- **A new top-level tree is not linted just because eslint.config.js has a block
  for it.** `npm run lint` names its trees, and `sdk` was not among them — so
  `npx eslint sdk` reported zero problems while checking nothing. This is the
  same failure `scripts/lint-scope.test.js` was written about; `sdk` is now in
  the script, the config and that test's list, and the gate was watched to fail
  by breaking a file on purpose.
- **The gate quoted `undefined` back at the person it was asking.** The moves
  are keyed by name in an object literal and carry no `name` field, so every
  refusal read "undefined would open a door" — a safety prompt nobody can act
  on is not a safety prompt. The names are stamped on at module load.

Seen, not asserted: driven over real stdio against the running install on :4000
(initialize → 14 tools → real space list → a public move refused); the whole
catalogue exercised end to end against a scratch space (ensure → project →
writeHtml verified byte for byte → front door → invite → delete), and then
**out of the packed 3.1 MB artifact**, where `di mcp` resolves `sdk/` beside
`cli/` and answers — because a command that only works in a checkout works for
whoever wrote it and nobody else.
