## 2026-08-08 — `di`: one line installs di.iiii on your own machine, offline

The ask was a CLI that installs di.iiii locally on any system from one pasted line, keeps
working without a network, and can later sync with the online instance. This branch is
phase 1 of that: install, run, offline. Sync, LAN/venue mode and the VJ output lane are
deliberately not here.

- **`di` CLI** (`scripts/di/`) — `up · down · status · open · logs · doctor · where ·
  backup · restore · update · uninstall`. `detect.mjs` is pure (probe results in, plan out)
  so all 22 of its branch tests run without touching the machine; `probe.mjs` holds the I/O;
  `ui.mjs` holds every artist-facing string, in the brand guide's voice.
- **Runtime artifact, not the repo** (`scripts/pack-runtime.mjs`) — dist + serverXR + shared
  + the CLI. 32 MB packed, ~100 MB installed, against 877 MB of `node_modules` for a
  checkout, and no Vite on the artist's machine. `npm run selfhost` is untouched and remains
  the developer path.
- **serverXR serves the app** when `CLIENT_DIR` is set, so a local install is one process on
  one port. Unset — the deployed topology — nothing changes and it stays a pure API behind
  nginx. New `HOST` (default `0.0.0.0`) lets a local install bind loopback.
- **`install.sh` / `install.ps1`**, published as `/get` and `/get.ps1` by a vite plugin plus
  exact-match nginx blocks before the SPA catch-all.
- **Fonts**: Inter and JetBrains Mono were named in the tokens and loaded from nowhere — the
  app rendered in system fallbacks and only looked right on machines that happened to have
  Inter. Now self-hosted (88 KB, variable, latin). That exposed a second thing: the landing
  has no ThemeProvider, so MUI put Roboto on every Typography and beat the Inter `.lp-root`
  already declared. Both fixed.

Four bugs that unit tests could not see, each found by installing onto a real bare machine:

- `res.sendFile(absolutePath)` 404s every SPA route when any path segment is hidden — `send`
  applies `dotfiles:'ignore'` to the whole absolute path, and the install lives in `~/.di`.
  The API and static assets kept working, so it read as a routing bug. The contract fixture
  now lives under a hidden directory; three tests fail without the fix.
- A vendored node has no `npm` beside it on PATH, and that machine may have no npm at all.
- nodejs.org publishes **no musl build** — Alpine 404'd. It now uses
  unofficial-builds.nodejs.org, and when that binary's `libstdc++`/`libgcc` are missing the
  installer prints the `apk add` line (tested, not guessed) rather than failing in riddles.
- Staging in `/tmp` then renaming into `$HOME` fails with EXDEV; staging is now
  `<versions>/<v>.partial`, on one volume.

Verified on four clean machines via podman — debian:12, alpine:3.20 (busybox ash + musl),
fedora:40, node:20-bookworm — each: install exits 0, `di` resolves in a fresh login shell,
`di up` serves `/main` and `/studio`, `di down` frees the port, `di uninstall` keeps
`~/.di/data`. Also run inside a network namespace with only loopback, and the page requests
zero external origins, so offline-first is measured rather than claimed. `nginx.conf` checked
against a real nginx: `/get` returns the script as `text/plain`, `/main` still returns the app.
`.github/workflows/install-matrix.yml` encodes all of that.

**algovrithm's media, fixed rather than worked around.** The 31 reels were 720x1280 at
~3.4 Mbps — 189 MB, bundled into every build, 205 MB of a 232 MB `dist` that di-studio.xyz
serves too. Both the assets README ("compress video before adding it") and `reelPlayers.js`
("compressing the source to something like 540p would make the whole question go away — the
reels are shown at about 1.4m wide on a 7m shell") had already said what to do. Done:
189 MB → 65 MB, `dist` 232 → 114 MB, the artifact 103 MB complete. Frame counts identical on
all 31, audio copied (the reels unmute on first gesture, so it is part of the piece), and the
before/after compared by eye — at the size the piece shows a reel they are indistinguishable
and the datamosh artefacts survive. The packer therefore no longer drops video by default;
`--lean` still does, for a 32 MB artifact, and names the cost. The recipe is in the assets
README so the next clip added matches.

**macOS verified on real hardware** (`di-mac`, M1, macOS 26.5.1 arm64, no node installed) —
the arm64 + darwin + vendored-node path end to end, `di` resolving in a real zsh login shell,
`/main`, `/studio` and a reel all 200, uninstall keeping the data. It found two PATH bugs that
no Linux container could:

- The installer read `process.env.PATH` to decide whether `~/.local/bin` was usable. Its own
  environment is a curl pipe / ssh / CI, not the artist's terminal — on the Mac `~/.local/bin`
  existed but was NOT on the login PATH, so the shim went somewhere useless and the install
  reported success. It now asks the login shell (`$SHELL -lc 'printf %s "$PATH"'`).
- The rc fallback picked the first existing file out of a list, which on macOS is `.zshrc` —
  and a LOGIN zsh never reads `.zshrc`. `di` was missing from exactly the shell someone opens
  next. The rc file is now chosen from `$SHELL`: `.zshenv` for zsh, `.bash_profile` before
  `.bashrc` on macOS. Debian and Alpine re-verified after the change.

The Mac was left exactly as found — uninstalled, `.zshenv` block removed, `~/.local/bin` and
`/tmp` cleaned.

**The update path is now guarded, and Windows is guarded with it.** `di update` promises one
thing — it never touches your work — so there is now an `update` CI job on **ubuntu-latest and
windows-latest** that installs a version, writes a canary space, updates, diffs the canary byte
for byte, rolls back, diffs again, and finally asserts `current` is still a *link* whose target
is whole. Windows is in that matrix specifically so it cannot drift while nobody is running it:
its update path has a failure mode unix does not, and one of them was real —
`fs.rm(junction, { recursive: true })` deletes **what the junction points at**, i.e. the
installed version. All link removal now goes through `unlinkLink()` (lstat, unlink a link,
rmdir only an empty directory, refuse anything else).

Also fixed while here: `ui.updateAvailable` was a string nothing ever printed. `di up` now
mentions a newer version in one dim line — after the app is already up, failing silently, and
at most once a day, so offline never waits on it. And `stageVersion` accepts a `file://` URL,
which is how CI exercises the real update code without publishing a release (and how a venue
with no network could update from a USB stick).

Run by hand on Linux, not just in CI: install → canary → update → rollback, canary identical
at every step, `current` still a symlink, both versions kept, data intact. Plus the failure
path — a build that installs but cannot boot is refused by the scratch-port health check and
leaves the artist on the working version, still serving.

**Still open:** **the GHCR packages are private**, so the CLI's docker branch self-skips (it
probes rather than assumes, and will light up with no new release once they are public).
Windows is written and covered by CI but has not been run by a human on real Windows.

## What CI found on Windows — four bugs, one per run

Everything above was verified on real Linux and macOS machines. Windows was written
blind and covered only by `install-matrix.yml`, and every round it found exactly one
more thing. All six Linux images were green throughout.

- **Two tars.** Windows ships bsdtar at `System32\tar.exe`, which understands `C:\...`;
  Git for Windows ships GNU tar, usually first on PATH, which reads a leading `C:` as a
  **remote host** — `tar (child): Cannot connect to C: resolve failed`, naming neither
  tar nor the drive letter. `tarCommand()` prefers bsdtar, else `--force-local`.
- **`di up` never returned the prompt.** `detached` and `unref` were both guarded by
  `!isWindows`, so the parent Node kept a handle on the child and its event loop never
  emptied. The server was up and the terminal was dead — including the terminal you would
  run `di down` from. Now detached + unref'd everywhere, `windowsHide` so no console
  window appears. It surfaced as a job that ran for **six hours and reported nothing**, so
  both Windows jobs now carry `timeout-minutes: 25`: a hang has to read as a failure.
- **A batch file needs CRLF.** cmd.exe re-seeks a `.cmd` by the byte length it believes
  each line had, so a missing CR costs one byte per line, cumulatively — later lines run
  with their heads eaten (`setlocal` → `etlocal`), ending in `di.iiii is not installed
  here ()` with an empty `%DI_HOME%`. **The same file worked one run earlier; two added
  comment lines pushed it over.** `.gitattributes` pins `*.cmd`/`*.bat` to `eol=crlf`,
  and `scripts/di/shim.test.js` holds that plus pure-ASCII (a batch file is read in the
  console code page) and the mirror rule for the sh shim.
- **The shim is `di.cmd` on Windows.** The CI harness hardcoded the unix name and failed
  with `No such file or directory` after a perfectly good install.

Also fixed here: the installer already falls back to `dii` when a foreign `di` owns the
name — that worked — but every message still said `di`, including `stop it with: di down`,
which points at the other binary. The shims now export their own basename (`$0` / `%~n0`)
and `ui.mjs` prints it.

**A conflicting PR runs no CI at all.** GitHub cannot build the merge ref, so every
`pull_request` workflow is skipped and the PR page shows nothing red. Two Windows fixes sat
untested behind that for a round. Check `mergeable` before reading green as green.

## Where it stands

- **PR #104** into `dev`, MERGEABLE/CLEAN. `install matrix` **12/12 green** (debian, ubuntu,
  fedora, alpine/musl, node 20 refused, node 22, offline, docker-mode, windows, both
  update-and-rollback jobs, pack) and `CI` green on the same commit.
- Merged `origin/dev` on the way: `bc22acb6` had run the repo's own `compress-reels.mjs
  --replace` over the same 31 algoVrithm reels this branch had re-encoded by hand. **Took
  dev's** — 81 MB / 360x640, the documented tool, verified beat by beat there — over this
  branch's 65 MB / 540x960 ad-hoc ffmpeg pass. The artifact is ~16 MB larger for it; tuning
  that script is the honest way to get it back, not overriding shared binaries in a merge.
- Nothing ships until a `v*` tag: that is what publishes the artifact the one-liner downloads.
- Blocked on the user: `gh auth refresh -s read:packages,write:packages`, then the GHCR
  packages can be made public and the docker branch stops self-skipping.
- Blocked on hardware: **real Windows**. CI is a clean runner with pwsh 7 and Git already
  present, which is not what a person's machine looks like — expect execution policy,
  antivirus on a freshly downloaded `node.exe`, and a username with a space in it.
- Phases 2-4 untouched: `di sync`, `di venue` (LAN + QR), the VJ output nodes. Sync's hard
  part is not transport — `PUT /scene` replaces a space wholesale and wipes its op-log, and
  `PUT /document` is last-write-wins with no version check.
