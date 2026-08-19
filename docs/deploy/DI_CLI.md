# `di` — di.iiii on your own machine

One line, any system, and after that it keeps working with no network. (One
thing still asks for it: `di up`'s once-a-day newer-version notice — bounded
at 3 seconds, failure swallowed, never blocking. Everything else is local.)

```
macOS / Linux   curl -fsSL https://di-studio.xyz/get | sh
Windows         irm https://di-studio.xyz/get.ps1 | iex
```

If di-studio.xyz is blocked, the same script is at
`https://raw.githubusercontent.com/dob-0/di.iiii/main/install.sh`.

Then:

```
di up          start it, and open it
di down        stop it
di status      what is running, where, and how big

di new NAME    start a new space
di save SPACE  save it as one file you can carry anywhere
di open FILE   open a file someone saved
di spaces      what is in this di.iiii

di backup      write your whole di.iiii to one file
di update      get the newest — never touches your work
di doctor      what this machine can and cannot do
di help        the rest
```

## Work as files

The model is Blender: you install the app, and your work is files you open, save,
copy to a stick and still open in ten years.

A **space bundle** is that file — `my-show.diiii`, one tar.gz holding everything a
space is made of: its scene, its whole op-log, every project document, its assets
and its blob store. Sync keys and GitHub links are stripped on the way out, so it
carries no secrets and no host-specific bindings and lands cleanly on any other
install.

The format is older than the commands. `scripts/space-bundle.mjs` has done this
since before `di` existed — what it did not have was a door, and
`node scripts/space-bundle.mjs export <id>` is not a thing anyone saves their work
with. `di new` / `di save` / `di open` / `di spaces` are that door and nothing more:
they run the same tool against this install's data root.

**Where the Blender model deliberately stops.** A `.blend` is yours alone and
"save" means flushing your buffer. A di.iiii space is *live* — someone else may be
standing in it — so there is no unsaved state and no moment where the work exists
only in memory. The server keeps it, continuously. A file is therefore the
**portable form** of the work, not the place it lives, and `di save` never means
"flush", it means "give me a copy I can carry". `di save` runs against a running
server for exactly that reason; `di open` stops it, imports, and puts it back,
because that one does write.

**A file says what wrote it.** The manifest carries `writtenBy` (the di.iiii
version) and `schemaVersion` (the shape its data was in) alongside the existing
`format`/`version`. A file from a NEWER di.iiii is refused by name rather than
half-imported:

```
this file was written by a newer di.iiii (0.9.0).
  the file stores work in shape 9; this di.iiii reads 1
  update first:  di update
```

Same rule as the database, for the same reason: a partial import does not fail, it
succeeds and means something slightly different. Files with no stamp at all — every
bundle written before 2026-08-19 — still open, because unknown must read as "open
it", never as "shape 0". `.diiii` is the extension now; `.space-bundle.tar.gz` files
keep opening, which is the entire point of having a format.

Offline is the default state, not a degraded one. The page requests zero
external origins (down to the 3D text labels, whose font is vendored — troika's
default resolver would have gone to a CDN), and the only outbound request the
CLI ever makes on its own is the once-a-day version check above. A laptop at a
venue with no wifi runs exactly the same as one at a desk.

---

## What gets installed, and where

```
~/.di/                       (%USERPROFILE%\.di on Windows)
  bin/di                     the shim on PATH
  runtime/node/              a node di downloaded, only if the system had none
  versions/<v>/              one immutable directory per version
  current -> versions/<v>    symlink (junction on Windows)
  previous -> versions/<v>   what --rollback returns to
  data/                      YOUR WORK — di.db, spaces/, uploads/
  di.env  state.json  logs/  run/
```

`data/` sits outside every `versions/` directory, so update, rollback and
uninstall physically cannot reach it. `di uninstall` removes the app and keeps
your work; `di uninstall --with-data` is the only thing that deletes it.

About 70 MB installed — a 3.1 MB download plus serverXR's production
dependencies. The repo's own `node_modules` is 877 MB, which is why an artist
gets a built runtime rather than a checkout.

It used to be 170 MB from a 103 MB download, because the artifact carried
di-studio.xyz along with the program: algovrithm's 31 reels and scan (88 MB),
the wcc exhibition microsite (25 MB), and the site's own hosting furniture —
against ~10 MB of di.iiii. The build now runs under `DI_PROFILE=local`, which
leaves those out of the graph rather than deleting the files afterwards (see
the local profile in `vite.config.js` — the reels were reached through
`raw/director/pieces.js`, the general tool, not through the piece's own route,
which is why the old `--lean` had to warn that a surface would show missing
media). `npm run di:pack -- --full` builds the complete hosted shape for
anyone who wants the pieces on their own machine; `--lean` is gone, and says
so if you pass it.

Nothing is written outside `$HOME`. Nothing asks for sudo, on any OS.

## Node or Docker — the CLI decides, not the artist

```
1. DI_MODE, or --docker / --node   → obeyed, no probing
2. node >= 22.15 (the system's, or one di downloads)                   → node
3. `docker info` succeeds AND the GHCR images are anonymously pullable → docker
4. neither → the two links that fix it; nothing is installed
```

**Node wins whenever it is viable** (changed 2026-08-10 — it used to be the
other way around). Docker Desktop merely being open would land an artist in
the one mode that carries none of the local operator surfaces: no `DI_LOCAL`,
a non-loopback `remoteAddress` seen by the server, and no way to reach a
`claude` binary on the host — so the agent board and the local Claude chat
node 404 there while the wiki promises them. Docker mode is real and kept,
but it is the deliberate choice (`--docker` / `DI_MODE=docker`), never the
accident. The recorded mode of an existing install never flips; this decision
runs at install/doctor time only.

Docker is gated on the image probe, not just on the daemon, so an install can
never 403 halfway through. **The GHCR packages are private today**, so the
docker branch skips itself; make `ghcr.io/dob-0/dii-server` and `dii-client`
public and it starts working with no new release.

Docker mode composes **both** files — `docker-compose.yml` *then*
`docker-compose.di.yml`, the same pairing CI runs. The `.di` file is only an
override (`!reset` tags, no volume definitions): composed alone, the named
`di-local_data` volume never exists and the work lands in an anonymous volume
`di where` never mentions. Both files ship in the runtime tarball.

The node floor is **22.15**, not serverXR's `engines: ">=22.5.0"`. `node:sqlite`
landed in 22.5 behind `--experimental-sqlite` and was unflagged later in the 22
line, so an artist on 22.6 would meet a crash about an unknown module instead of
a sentence they can act on.

## How it runs

One process, one port. `serverXR` serves the API *and* the built app via
`CLIENT_DIR` — no Vite, no second port, no build on the artist's machine.
Bound to `127.0.0.1`: a laptop on café wifi with auth off is not meant to be an
editor the whole room shares. LAN exposure is a later, deliberate feature that
arrives with an auth story.

`npm run selfhost` still exists and is unchanged — that is the developer path,
for someone who wants the source and the dev stack.

## Updating

`di update` stages the new version to `<v>.partial`, verifies its sha256,
installs dependencies and health-checks it **on a scratch port** before stopping
anything. `current` flips last. Any failure leaves you exactly where you were
and says so. `di update --rollback` returns to `previous`.

### What an update actually risks

An update moves two things: the app, and sometimes the shape the work is stored
in. `--rollback` only moves one of them back. Four things stand between an
artist and finding that out afterwards.

**The health check opens your work, not an empty directory.** It used to boot the
staged build against a fresh `mkdtemp`, which proves the binary starts and
nothing else. It now copies the whole data root — database, spaces, assets — lets
the new build open the copy and run its migrations there, and throws the copy
away. A migration that cannot read *your* database fails before the flip, while
the old version is still running. `rehearseAgainst()` in `scripts/di/install.mjs`.

**The database says how far forward it has come.** `SCHEMA_VERSION` in
`serverXR/src/db.js`, written to `PRAGMA user_version` after the migrations run.
A build that cannot read that far **refuses to open the data** rather than
guessing — because the failure mode of guessing is not a crash.
`v2_user_is_unrestricted` rewrote every `spaces = 'null'` (the old spelling of
"unrestricted") into `'[]'` plus a flag; a build from before that reads `'[]'` as
"no access to anything" and locks people out of their own spaces, silently. Bump
`SCHEMA_VERSION` when a change would make an older build MISREAD data — not for
every schema edit, since adding a column is invisible to older code.
`DI_ALLOW_OLDER_CODE=1` opens it anyway, for a recovery that knows the difference.

**A copy is taken before the flip, when the schema moves.** Automatic, into
`~/.di/snapshots/before-<version>-<stamp>/`, and only when the update actually
moves the schema — otherwise there is nothing rollback cannot undo. `di restore
--snapshot` lists them; `di restore --snapshot <name> --yes` puts one back, and
moves what it replaces aside under `replaced-<stamp>` rather than deleting it.

**Rollback refuses to cross a schema boundary**, before moving anything, and
names the snapshot that fixes it:

```
that version is older than your work.
  your work is stored in shape 2; that version reads 1
  the copy taken before that update:  di restore --snapshot before-0.5.0-...
```

And `di update` refuses to walk backwards: a machine ahead of the release feed —
a build installed from a file, an rc, a test install — is told so rather than
downgraded. `--force` if you mean it.

### Updating with no network

```
di update --from ./di-runtime-0.5.0.tar.gz
```

The artifact on a USB stick, at a venue, with nothing to reach. `download()` has
spoken `file://` since the beginning and this document promised the capability,
but no command exposed it until 2026-08-19 — a promise no command keeps is not a
feature. Naming a file skips the feed and the is-this-newer question: someone who
names a file has chosen that file.

### Where versions come from

**Every `dev → main` promotion is tagged**, by `.github/workflows/tag-on-promotion.yml`,
which runs *after* the production deploy succeeds — a tag is a promise that this
code runs, and the honest moment to make it is once it has. It bumps the patch
from the newest tag, unless the commit is already tagged (someone chose a version
on purpose) or a `workflow_dispatch` names one.

It then **calls** `release.yml` rather than letting the tag trigger it: a tag
pushed with `GITHUB_TOKEN` does not fire `on: push: tags`, so waiting would leave
every automatic tag with no artifact behind it — a version that exists and cannot
be installed, which is worse than no version at all.

Tagging this often is only reasonable because the artifact is 3.1 MB. At that
size a release is a small thing to hand someone, and an update over a phone
hotspot at a venue is realistic.

`di up` mentions a newer version in one dim line and never installs it — silent
auto-update mid-gig is how you lose a show. That check runs *after* the app is
already up, swallows every failure, and only looks once a day, so an offline
machine never waits on it and never retries in a loop.

An update can also come from a file rather than a release: `stageVersion` accepts
a `file://` URL, which is how CI drives the real code path without publishing,
and how a venue with no network updates from a USB stick.

**What is actually asserted, on Linux and Windows, on every change** (the
`update` job): install a version, create a canary space with known contents,
update onto a second version, and diff the canary — byte for byte. Then roll
back and diff it again. Then assert `current` is still a *link* and the version
it points at is whole.

That last one is not paranoia. On Windows `current` is a junction, and
`fs.rm(junction, { recursive: true })` deletes **what it points at** — the
installed version. Every removal of a link goes through `unlinkLink()`, which
lstats first, unlinks a link, `rmdir`s only an empty directory, and refuses
anything else rather than deleting it.

Verified by hand as well as in CI, including the failure path: a version that
installs but cannot boot is caught by the scratch-port health check before
anything is stopped, and the artist stays exactly where they were.

## Releasing

`.github/workflows/release.yml` builds and attaches `di-runtime-<version>.tar.gz`
and `checksums.txt` to the GitHub Release — for every `v*` tag a human pushes, and
on demand when `tag-on-promotion.yml` calls it (see "Where versions come from"
above). The installer reads `releases/latest`, so the tag and the artifact
filename must agree — the packer takes the version from the tag, or from the
caller's input, for exactly that reason. Never from `package.json`, which is not
the released number and has read 0.2.0 since v0.2.0.

`release.json` inside the artifact records `version`, `profile` (local or hosted
— two artifacts with the same filename are otherwise indistinguishable) and
`schemaVersion`, which is what `di update` compares against the artist's own
database before it flips anything.

`.github/workflows/install-matrix.yml` is the stranger's-machine test: debian,
ubuntu, fedora, alpine (busybox ash + musl), node 20 (too old) and node 22, plus
an offline job, a Windows job, and a docker-mode job that self-skips while the
images are private.

## Testing a change without publishing a release

```bash
npm run di:pack -- --no-build                 # → dist-runtime/
DI_INSTALL_ARTIFACT=dist-runtime/di-runtime-0.2.0.tar.gz \
DI_INSTALL_VERSION=0.2.0 sh install.sh        # installs that build
DI_INSTALL_DRY=1 sh install.sh                # prints the plan, downloads nothing
DI_HOME=/tmp/di-test node scripts/di/cli.mjs up   # a throwaway install
```

To exercise a real stranger's machine locally:

```bash
podman run --rm --network host \
  -v "$PWD/install.sh:/tmp/install.sh:ro,Z" -v "$PWD/dist-runtime:/artifacts:ro,Z" \
  docker.io/library/debian:12 bash -c \
  'apt-get update -qq && apt-get install -y -qq curl ca-certificates
   DI_INSTALL_ARTIFACT=/artifacts/di-runtime-0.2.0.tar.gz DI_INSTALL_VERSION=0.2.0 sh /tmp/install.sh
   bash -lc "di up --port 4300 --no-open && curl -s -o /dev/null -w %{http_code} http://127.0.0.1:4300/main"'
```

**Use `DI_HOME` with a dot in it.** Three real bugs hid behind test paths that
looked nothing like a real install — see below.

## Things that were learned the hard way

- **`res.sendFile(absolutePath)` 404s under a hidden directory.** `send` applies
  `dotfiles: 'ignore'` to every segment of an absolute path, and the default
  install lives in `~/.di`. The API and static assets keep working, so it reads
  as a routing bug and is not one. Always `sendFile(name, { root })`. The
  contract fixture in `serverXR/src/spaHostingContracts.test.js` lives under a
  hidden directory for this reason.
- **A vendored node has no npm on PATH**, and that machine may have no npm at
  all. Resolve npm as a sibling of the running node, and put that node's
  directory on PATH for the child.
- **nodejs.org publishes no musl build.** Alpine's node comes from
  `unofficial-builds.nodejs.org`, and that binary needs `libstdc++` and `libgcc`,
  which Alpine's base image lacks. The installer prints the `apk add` line rather
  than failing in riddles.
- **Do not stage in `/tmp`.** Renaming from tmpfs into `$HOME` fails with EXDEV.
  Stage in `<versions>/<v>.partial`, on one volume.
- **Do not resolve files relative to a directory you are about to rename.**
- **The installer cannot see the artist's PATH.** It runs from a curl pipe, an
  ssh command or CI, each with its own reduced environment. Ask the login shell
  (`$SHELL -lc 'printf %s "$PATH"'`) instead of reading `process.env.PATH` — a
  shim dropped in a directory that is not really on PATH leaves
  `di: command not found` after an install that reported success. macOS found
  this: `~/.local/bin` existed but was not on the login PATH.
- **A batch file needs CRLF, or cmd.exe eats characters.** LF-only `di.cmd`
  drifts one byte per line and starts running `setlocal` as `etlocal` — it
  reports `di.iiii is not installed here ()` and names nothing that is wrong.
  `.gitattributes` pins `*.cmd` to `eol=crlf`; `scripts/di/shim.test.js` holds
  it. Keep the file pure ASCII too: it is read in the console code page.
- **Windows needed `detached` + `unref` too.** Without them the CLI's own event
  loop never empties, so `di up` starts the server, prints the URL and then
  never gives the prompt back. Nothing fails; the terminal just stops. Both
  Windows jobs now carry `timeout-minutes`, because a hang has to read as a
  failure rather than as a job still running.
- **When the command is renamed, the sentences have to be renamed with it.** The
  installer becomes `dii` if a foreign `di` already owns the name; the shim now
  exports its own basename so every message says the word the artist types.
- **A login zsh never reads `.zshrc`.** It reads `.zprofile` and `.zshenv`, so a
  PATH line in `.zshrc` is missing from exactly the shell an artist opens next.
  Pick the rc file from `$SHELL`, not from which files happen to exist —
  `.zshenv` for zsh, `.bash_profile` before `.bashrc` on macOS.

## Not here yet

`di venue` with a QR for the room (phase 3) and the VJ output nodes (phase 4).

`di sync` (phase 2) has landed — `di link` verifies a sync key against the
remote and stores it 0600 with a ledger, `di sync <space>` reads both sides
verbatim-or-refuses, and a diverged pair is refused in both directions. What
made it hard was real and is fixed: `PUT /scene` replaced a space wholesale and
wiped its op-log both ways, and `GET /scene` returned a rendering rather than
the stored scene, so pull-then-push permanently deleted upstream entries this
machine had merely not downloaded.
