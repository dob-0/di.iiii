## 2026-09-06 — `di backup` carries the light show, `di open FILE` stops nothing, `di --version` prints a version

The festival-machine inventory (`docs/testing/FESTIVAL_MACHINE_2026-09-06.md`) named
three things in the `di` CLI. All three are fixed here, each with a test that would have
caught it.

- **The light show travels.** `scripts/install-bundle.mjs` now carries `data/lighting/`
  (show.json, show.prev.json, the fixture library) and `data/agent-chat/` whole, beside
  the spaces, and lists them in `install.json` as `dirs`. Import puts them back; keeps a
  show already on the target unless `--force` (same rule as the instance config); a
  bundle written before the field existed lists nothing and imports exactly as before.
  `di backup` no longer says "this one file is your whole di.iiii" — it says what is
  inside (every space, the light show when there is one, the agent chat folder when it
  has something in it, the settings) and what is not (accounts, sign-ins and the AI chat
  history, which are rows keyed by user in di.db and stay with the machine).
  `di restore FILE` now stops a running server first and puts it back after: a running
  lighting desk holds its show in memory and writes it back on the next change, so a show
  restored underneath it lasted until the first fader move.
- **`di open FILE` goes through the running server.** `POST /api/spaces/bundle`, the same
  door the browser's Open a file uses, streamed with `fs.openAsBlob`. Nobody else on the
  machine loses their tabs. The stop-import-restart path is kept for exactly two cases and
  says why before it stops: `--force` (the space being replaced may be open in a tab) and a
  file over the server's upload cap (`MAX_UPLOAD_MB`, 100 by default — a 413, or the
  connection the server drops mid-stream; the server's own 413 text sends people to
  `di open`, so `di open` had to be the path with no cap).
- **Routing.** `--version` / `-v` print the version; `di mcp --help` and `di help mcp`
  print a usage instead of silently serving MCP on stdin; an unknown flag on a bare `di`
  refuses with the usage instead of falling through to `di up` (`BARE_FLAGS` is the
  allow-list: `--port`, `--no-open`, `--verbose`). `main()` now runs only when the file is
  invoked directly, so tests can import the CLI's table and parser.
- **`di mcp` says which version it is.** `sdk/mcp.mjs` read `../package.json`, which the
  packed runtime does not carry; it reads `../release.json` first (the install), then
  `package.json` (a checkout), and `cmdMcp` prefers the installed `sdk/` over the one
  beside the running `cli.mjs`.
- **A silent no-op found on the way:** both bundle scripts guarded `invokedDirectly` by
  comparing `process.argv[1]` unresolved against Node's realpath'd `import.meta.url`, so
  `node ~/.di/current/scripts/install-bundle.mjs import …` typed by hand did nothing and
  exited 0. Both guards realpath both sides now.

Verified: `scripts/di/cliRouting.test.js` (spawned, temp `DI_HOME`, including through a
`current` symlink), `scripts/di/openFile.test.js` (a real install layout under a temp
`DI_HOME`, `di up` on a free port with `MAX_UPLOAD_MB=1`: open-through-API leaves the pid
alone, a clash comes back in the server's words, a 2.5 MB file takes the fallback,
backup lists the show, restore puts it back), `serverXR/src/installBundleContracts.test.js`
(the show and the chat folder round-trip and the desk on the target serves the restored
show; kept-unless-`--force`; a manifest with no `dirs` field imports), `sdk/sdk.test.js`
(`detectVersion` in both shapes). Walked by hand against a fake install on port 4171 before
any of the tests were written. Never touched `~/.di`.
