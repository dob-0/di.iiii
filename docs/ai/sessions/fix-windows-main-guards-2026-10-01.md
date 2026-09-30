## 2026-10-01 — Windows main-script guards

**Symptom (found on Windows by another session):** scripts that ended with
`if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) main()` ran
nothing and printed nothing. On Windows the URL pathname is `/C:/Users/...`, never equal to `C:\Users\...`.
The variants `import.meta.url === \`file://${process.argv[1]}\`` fail the same way (and on any path with a
space or non-ASCII character, even on Linux, because the URL is percent-encoded).

**Fix:** one helper, `scripts/lib/isMainModule.mjs` (`isMainModule(import.meta.url, argv1 = process.argv[1])`):
`fileURLToPath` (the documented conversion) on one side, `path.resolve(argv1)` on the other, both passed through
`fs.realpathSync` in try/catch so a symlinked bin still matches; false when argv1 is missing. 31 scripts now
use `if (isMainModule(import.meta.url))` with their existing main call unchanged. Non-guard uses of the same
pathname idiom (path roots in `realism.mjs`, `sway.mjs`, `build-reel-atlas.mjs` and five test files) became
`fileURLToPath(...)`.
No changed script is documented as copied alone to another machine, so none inlines the logic. (The
vendored `space-sync.mjs` already used `fileURLToPath` and was not touched.)

**Left alone on purpose:** `scripts/rigbuild/versions.mjs` (another session fixes it on its own branch); it is
allow-listed in `scripts/noPathnameMainGuard.test.js` with that reason. Remove the allow-list entry when that
branch lands. Scripts that already used `fileURLToPath` were not touched.

**Tests:** `scripts/lib/isMainModule.test.js` (same file, other file, argv1 missing/empty, relative argv1,
symlink, spaces/non-ASCII, Windows shape) and `scripts/noPathnameMainGuard.test.js` (scans scripts, serverXR,
src for the old patterns). Before the fix: the helper test could not load (no helper) and the scan test failed
with 43 hits; after: 8 of 8 pass.

**Run:** those two files; 19 changed scripts' own test files (214 tests pass); `eslint` on changed files (0
errors; one existing unused-variable warning in `versions-page.mjs`); `node scripts/tier-sync.mjs --help`
(prints usage); `node --check` on every changed script.

**NOT run:** on a real Windows machine. The Windows case in the helper test is asserted by construction, on
Linux, using Node's `fileURLToPath(url, { windows: true })` against `path.win32`; someone must run e.g.
`node scripts/rigbuild/sway.mjs` on Windows to see it. The scripts themselves (most write, call the API, or
launch a browser) were not run. `serverXR/src/rig/routes.test.js` could not run here: `express` is not
installed in the shared node_modules (same failure without my change).
