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

**Still open, and deliberately not fixed here:** `src/algoVrithm/assets` holds 197 MB of stock
video imported as ES modules, so every build bundles it — 205 MB of a 232 MB `dist`, which
di-studio.xyz serves today as well. The packer drops those files by default, says so on
stdout, and writes `MISSING_MEDIA.txt` naming the affected surface; the real fix is
lazy-loading the imports. **The GHCR packages are private**, so the CLI's docker branch
self-skips (it probes rather than assumes, and will light up with no new release once they
are public). The Windows path is written and covered by CI but has not been run by a human on
real Windows, and macOS has not been tried at all.
