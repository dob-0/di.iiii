## 2026-09-20 — the run skill pointed agents at a live install's port

`run-di-iiii` documents `:4000` as the dev server's port, and its gotcha on a
stale `node --watch` says to find the holder with `pgrep -af "src/index.js"` and
kill it. On a machine with a local `di` install — the artist's own machine, a
stage box — port 4000 is that install's LIVE server, started from that same
`src/index.js`. Two agents running the stack in parallel worktrees followed the
recipe and took down a running two-machine rig; both times the server log simply
ended mid-request with no error, which reads as a crash rather than a kill, so
the first one was misdiagnosed.

- The skill now opens with who owns 4000 and how to run elsewhere, and the
  gotcha says outright that `pgrep -af "src/index.js"` matches an installed
  di.iiii too, with `di status` as the test.
- The escape was verified rather than reasoned: `VITE_API_BASE_URL=
  http://localhost:4360/serverXR npm run dev` — `dev-stack.mjs` reads the API
  base, passes its port to `serverXR` as `PORT` (dev-stack.mjs ~l.220) and
  proxies `/serverXR` to it. Health answered 200 on 4360 and the install on
  4000 was still `running` afterwards. `VITE_PORT=5360` did **not** move Vite,
  which stayed on 5173 — so the skill says to pass `--port` to the client
  instead of repeating an env var that does not work.
- Documentation only: no code changed, nothing to regression-test beyond the
  known-fixes row.
