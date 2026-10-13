## 2026-10-13 — One local address on every machine: carry #825 + #826 to dev, one name in what di prints

- Owner, 2026-10-13: *"fix the di.iiii links here in my machine — mine is local.thedi.studio, in others other
  — fix mine too and make only one way to work."* The design is the owner's, decided 2026-10-07: `http://diiii.localhost/`
  opens THAT machine's own installed di, on every machine; the https name is only for phones and headsets.
- Carries #825 (`feat/one-local-address-2026-10-07`: the door on loopback :80, the judgement by machine id,
  `di open`, `di status`, `docs/ai/one-local-address.md`) and #826 (`feat/one-local-address-guest-qr-2026-10-07`:
  the phones QR code; `uqr` 0.1.3, `jsqr` 1.4.0). Both were 587 commits behind dev. Merged into dev at `bdf29845`
  (`git merge --no-ff`, the two branches untouched). Conflicts, and what was kept:
  - `package.json`: dev's lines + `localNameContracts` and `guestAddressContracts` in `test:server-contracts`,
    `uqr` 0.1.3 and `jsqr` 1.4.0 (exact, as in the dependency-decisions row).
  - `package-lock.json`: dev's, then `npm install --package-lock-only`; measured against origin/dev: +2 packages (uqr 0.1.3, jsqr 1.4.0 dev-only), none removed, none changed. `npm ci` runs with `DI_NO_GIT_HOOKS=1` in a worktree (see Owed).
  - `serverXR/src/index.js`: dev's follow-lease start, then the door (`startLocalName`).
  - `src/copyVocabulary.test.js`: both added files kept.
- D1 — one address in what di prints. When `http://diiii.localhost/` is judged to be this di (same `machine.id`
  directly and through :80), `di status` leads with it, and `di up` (its card, its doors, `already running —`, the browser
  it opens) too. The certificate's name moves to ONE line, `phones and headsets: https://<name>`. Not judged: what was
  printed before + one dim line why. `printedAddress` in `scripts/di/state.mjs` is the one decision.
- D2 — one name before :80: the pretty-name probe asks `diiii.localhost`, not `di.localhost`. The card no longer
  calls a `.localhost` name an address "on the phones".
- Method: tests first (red on the unchanged code: 15 of 16 failed in `scripts/di/oneAddressPrinted.test.js`), then the change (green). The door on :80 is the one thing a
  test cannot open, so its answer is handed in; the install, its server and the real CLI (`main()`, `status`, `up`) are real.
- Tests: the new `scripts/di/oneAddressPrinted.test.js` has 16 tests. Focused set (`scripts/di`, the server and
  page tests of #825/#826, `src/copyVocabulary.test.js`, `src/utils/deployMode.test.js`, `src/wiki`): 48 files, 616 tests passed.
  Full suite (`vitest run --maxWorkers=4`, 400 s): 918 files passed, 1 skipped; 10357 tests passed, 2 expected fail, 7 skipped; no failure.
  `serverXR` needs its own `npm ci` (`serverXR/node_modules`): the first focused run failed 5 tests and 2 files on `Cannot find module 'express'`/`'dotenv'`, which is the missing install, not the change.
- Live, read-only, against the installed di: `oneAddress(~/.di, 443)` → `{ url: "http://diiii.localhost/", why: null }` and `printedAddress` →
  `{ url: "http://diiii.localhost/", one: true, phones: "https://local.thedi.studio", why: null }` (installed di `0.4.4-dev.bdf29845`).
  This tree's `di status` against that install prints `running (node) · 0.4.4-dev.bdf29845 · http://diiii.localhost/ · this machine only · data …`
  then `phones and headsets: https://local.thedi.studio` (the lead measured the first line as `https://local.thedi.studio` before).
- Wiki: the "One link opens it" entry says where phones and headsets find their address; `updated` 2026-10-13.
- Owner: merge this PR, close #825 and #826 (it replaces them). Other Linux machines need :80 once:
  `pkexec setcap cap_net_bind_service=+ep "$(jq -r .service.node ~/.di/state.json)"`, then `di down && di up`.
- Owed: the owner's own look at `http://diiii.localhost/` on his screen; `di new`, `di open FILE` and `di stage` still print the
  certificate's name or `localhost:<port>` (docs/ai/one-local-address.md §9 item 11); macOS, Windows and Safari measurements
  (§6); a real phone scan of the QR code (#826's owed list).
- Owed (process): `npm ci` in a di.iiii worktree runs `prepare` (`scripts/install-git-hooks.mjs`), which writes the repo-wide
  `core.hooksPath`; run it as `DI_NO_GIT_HOOKS=1 npm ci` (and `npm --prefix serverXR ci` for the server tests). This belongs in the brief template.
