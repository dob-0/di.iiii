# feat/ndi-get — the NDI runtime, fetched

The NDI lane (#529) works, and every machine that wants it has to find the
runtime by hand. On Arch that is an AUR package and a root password; on a
borrowed laptop at a venue it is neither. `di ndi get` fetches it from Vizrt
into `~/.di/ndi/lib/` and points `DI_NDI_LIB` at it — no admin rights on any
of the three platforms, because `library.js` already tried that variable first.

Fetched, never bundled: the licence position in `docs/architecture/NDI.md` is
unchanged. The bytes come from Vizrt; this only does the clicking.

## What landed

- `scripts/di/ndi.mjs` — the fetch, per platform, with a receipt.
- `scripts/di/ndi.test.js` — 20 tests; the magic-number guard and the careless
  `remove` were both mutated and watched go red.
- `di ndi get | status | remove`, a `doctor` line, help, and the runtime added
  to what `uninstall` removes.
- `docs/deploy/DI_CLI.md`, `docs/architecture/NDI.md`.

## Seen on real hardware, not inferred

- aylmo, cold: 65.5 s end to end; `libndi.so.6` 27,287,968 bytes; loaded
  through serverXR's own `library.js` → `NDI SDK LINUX … 6.3.2.0`, send
  binding present.
- The real 225 MB macOS `.pkg` unpacked on Linux in 2.3 s → a 29,805,920-byte
  universal Mach-O, accepted as darwin and correctly refused as linux.
- The Linux tarball's sha256 matched Arch's `ndi-sdk` PKGBUILD exactly.
- The Windows `NDI 6 Runtime.exe` is Inno Setup 6.1 (read from the real file).

## The gap, named

The Windows unattended install has NOT been run on Windows — the switches are
Inno's documented ones, which is not the same as observed. The fallback (an
already-installed runtime found via `NDI_RUNTIME_DIR_V6`) is tested; the silent
install is not. Next machine that can run it should.
