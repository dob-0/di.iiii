## The festival-machine gaps, landed as one batch

Six PRs from the 2026-09-06 inventory (`docs/testing/FESTIVAL_MACHINE_2026-09-06.md`),
each written by its own agent and reviewed by two more, merged into one branch so they
cost one CI run instead of six races.

- **#392 `di up --lan`** — the blocker. A phone in the room can open the machine; the flag
  is per start, prints every non-internal IPv4 with its interface and one warning that auth
  is off, and refuses in docker mode (the container binds 0.0.0.0 while compose publishes
  loopback). `GET /api/config` gained a read-only `listen: { lan, addresses }`; the lighting
  desk's Phone box reads it and says "start it with: di up --lan" instead of showing a QR
  code that cannot work. The local-operator gates (agent board, local claude, local model)
  stay keyed on a loopback remote address, so a LAN visitor still gets 404.
- **#391 `di backup` carries the light show** — and the AI chats; the line no longer claims
  more than it holds. `di open FILE` imports through the running server the way the browser
  does instead of restarting it for everyone. `di --version` prints a version, `di mcp --help`
  prints usage, and MCP reports the install's real version.
- **#389 an unknown space id** 404s on a scene read and writes nothing (it used to create a
  directory in the real tier), and the "Nothing lives at …" card now shows on a local install
  instead of a silent empty room.
- **#393 a new panel window** opens whole on screen at any zoom, and a wired input port is
  read-only in the inspector instead of silently ignoring what you type.
- **#390 the "left out of this copy" stub** names the piece and offers two doors back; the
  space card says "not in this copy" instead of showing a black frame. Wiki updated for the
  local model, the keeper's two hosts, and the toybox.
- **#394 vendored libraries** — three (0.128/0.160/0.166), leaflet, cannon-es, marked and
  es-module-shims under `public/vendor/`, plus `scripts/page-vendor-cdn.mjs` to point a
  published page at them. The tool refuses to rewrite a page for a `/vendor/` the target
  server does not serve, and `--restore` puts an original back.

Conflict resolution in this batch, all in `scripts/di/`: `cmdOpenFile` takes #391's
through-the-server import and #392's remembered `--lan` bind on the paths that still stop
the server; `di restore FILE` keeps the bind too (its `--snapshot` path stops and stays down
by design, so the test slices the file path only).

Verified on the batch: `npm run test -- --run` 3692 passed / 1 skipped, eslint clean on the
resolved files, docs gate passes.
