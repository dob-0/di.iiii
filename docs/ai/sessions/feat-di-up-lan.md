## 2026-09-06 — `di up --lan`: a phone in the room can open the festival machine

The one blocker in `docs/testing/FESTIVAL_MACHINE_2026-09-06.md`: the install listened on
`127.0.0.1` only, the CLI had no way to say otherwise, and the lighting desk's Phone box
printed a LAN URL and a QR code no phone could open. Owner's decision: `di up --lan`, auth
stays off, the room can edit.

### What changed

- **`di up --lan`** (`scripts/di/cli.mjs`, `runner-node.mjs`, `ui.mjs`, `probe.mjs`,
  `state.mjs`): binds `0.0.0.0` for that start, prints every non-internal IPv4 address as a
  URL with its interface name, and one plain yellow warning — "anyone on this network can
  open and edit it — auth is off". Nothing persisted: `di.env` still holds only the port.
  The runner also sets `DI_ALLOW_LAN_DEVICES=1` for a wildcard bind, because `/light` sits
  behind that guard and would 403 every phone otherwise; it probes readiness on loopback,
  since `0.0.0.0` is not a connectable address on every OS. Docker mode refuses the flag
  (its compose pins `127.0.0.1`). `parseArgs` moved verbatim to `scripts/di/args.mjs` so it
  can be tested without running the CLI.
- **`di status` / `di where`** ask the running server which bind is in force
  (`probeListen` → `GET /serverXR/api/config`) and say "this machine only" or
  "this network — http://…". `di open FILE` and `di update` ask before they stop the
  server and restart with the same bind, so a `--lan` night does not silently drop its
  phones on an import.
- **Server** (`serverXR/src/listenInfo.js`, new; `routes/configRoutes.js`, `index.js`):
  `/api/config` gains read-only `listen: { lan, addresses }`, computed per request from
  `config.host`. Addresses only when the bind is not loopback AND the runtime is local
  (`di` install or a dev box) — a hosted server also binds `0.0.0.0` and its container
  addresses are not for an unauthenticated endpoint to hand out.
- **Lighting desk** (`routes/lightingRoutes.js`, `lighting/desk.js`, `lighting/standalone.js`,
  `lighting/ui/app.js`): the host passes `listen` into `createDesk`, `status.listen` carries
  it per poll, and `buildPhone()` shows "Phones cannot reach this desk — start it with:
  di up --lan" with no QR when `listen.lan` is false or the LAN guard is closed, the real
  URL + QR otherwise. A desk never told (`listen` null) behaves as before. `standalone.js`
  spells its own `listen` inline so `lighting/` stays self-contained for the club machine.
- **Review fix (docker mode's reach):** the container always binds `0.0.0.0` (no `HOST`,
  no `DI_LOCAL`) while the compose publishes the port on `127.0.0.1`, so a docker install's
  server answers `listen.lan: true` and the CLI repeated it — `di status` / `di where` said
  "this network — no address yet" and a running `di up --lan` said "on this network too",
  because the docker refusal sat after the already-running return. One helper in `cli.mjs`,
  `probeReach(home, port)`, answers `{ lan: false, addresses: [] }` for a docker install and
  asks the server otherwise; all five sites (status, where, the already-running branch of
  up, and the ask-before-stop in open-file and update) go through it, and `cmdUp` refuses
  `--lan` in docker mode before it looks for a running server. Reproduced and re-run
  against a fake docker-mode `DI_HOME` and my own server bound `0.0.0.0` on a spare port:
  before, all three commands claimed network reach; after, "this machine only" and the
  refusal. Node mode on the same server still reads "this network — http://…".
- **Kept, deliberately:** the agent board, local Claude, local model and work-status gates
  key on `req.socket.remoteAddress` (`trust proxy` off) — a LAN visitor is still refused
  under `--lan`; `agentBoardStore.test.js` and `aiChatRoutes.test.js` already hold that.
- Docs: `docs/deploy/DI_CLI.md` (new `di up --lan` section, replaces "LAN exposure is a
  later feature"), `docs/architecture/LIGHTING_DESK.md`, `docker-compose.di.yml` comment,
  wiki (`src/wiki/wikiContent.js`: the `di` list and the desk's Touch line).

### How it was verified

- New tests: `scripts/di/lan.test.js` (arg parsing, address filtering, source-level
  guards on cli/runner/ui), `serverXR/src/listenInfo.test.js`, `serverXR/src/routes/configRoutes.test.js`,
  two cases in `routes/lightingRoutes.test.js`; `fileMenu.test.js`'s restart needle updated.
  Existing suites of every touched file rerun green (see the PR body for the list).
- Seen, not assumed: my own serverXR on a spare port, started twice exactly as the runner
  does — `HOST=127.0.0.1` and `HOST=0.0.0.0 DI_ALLOW_LAN_DEVICES=1` — headless Chromium at
  DPR 2 on `/light/` with the Output block open; both Phone-box states read from the
  screenshots. `/api/config` curled in both states; a request from this machine's LAN
  address confirmed 200 on `/light/api/summary` under `--lan` and 403 without.

### Still open

- A standalone headset is still out: WebXR needs a secure context and a LAN address over
  plain http is not one. Separate gap.
- The Open Space's QR still points at di-studio.xyz (data, not this lane).
