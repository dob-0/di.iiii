# `di` — di.iiii on your own machine

One line, any system, and after that it never needs the network again.

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
di backup      write your whole di.iiii to one file
di update      get the newest — never touches your work
di doctor      what this machine can and cannot do
di help        the rest
```

Offline is the default state, not a degraded one. Nothing phones home after the
install; the page requests zero external origins. A laptop at a venue with no
wifi runs exactly the same as one at a desk.

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

About 170 MB installed — a 103 MB download plus serverXR's production
dependencies. (`npm run di:pack -- --lean` drops algovrithm's reels for a 32 MB
artifact, and says so; that surface then shows missing media.) The repo's own
`node_modules` is 877 MB, which is why an artist gets a built runtime rather
than a checkout.

Nothing is written outside `$HOME`. Nothing asks for sudo, on any OS.

## Node or Docker — the CLI decides, not the artist

```
1. DI_MODE, or --docker / --node   → obeyed, no probing
2. `docker info` succeeds AND the GHCR images are anonymously pullable → docker
3. node >= 22.15 (the system's, or one di downloads)                   → node
4. neither → the two links that fix it; nothing is installed
```

Docker is gated on the image probe, not just on the daemon, so an install can
never 403 halfway through. **The GHCR packages are private today**, so the
docker branch skips itself; make `ghcr.io/dob-0/dii-server` and `dii-client`
public and it starts working with no new release.

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
and `checksums.txt` to the GitHub Release for every `v*` tag. The installer reads
`releases/latest`, so the tag and the artifact filename must agree — the packer
takes the version from the tag for exactly that reason.

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
- **A login zsh never reads `.zshrc`.** It reads `.zprofile` and `.zshenv`, so a
  PATH line in `.zshrc` is missing from exactly the shell an artist opens next.
  Pick the rc file from `$SHELL`, not from which files happen to exist —
  `.zshenv` for zsh, `.bash_profile` before `.bashrc` on macOS.

## Not here yet

`di sync` (phase 2), `di venue` with a QR for the room (phase 3), and the VJ
output nodes (phase 4). Sync's hard part is not transport — it is that
`PUT /scene` replaces a space wholesale and wipes its op-log, and `PUT /document`
is last-write-wins with no version check.
