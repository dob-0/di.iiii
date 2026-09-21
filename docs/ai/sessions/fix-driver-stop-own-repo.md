## 2026-09-21 — the run skill's `stop` killed the installed di.iiii, third time

Four agents ran dev stacks in parallel worktrees on a machine whose `:4000` is a live
`di` install serving a two-machine stage. One agent stopped its stack with
`driver.mjs stop`; the installed server died with it (`di status`: `Not running`, the
stage machine's follow: `no route`). The skill's own text warned about `pgrep -af
"src/index.js"` matching the install — and `stop()` did the same match by command line.

- `scripts/dev-stack-owned.mjs` (pure, tested): stack processes are split into ours and
  others by WORKING DIRECTORY — under the driver's repo (serverXR subdir included) is
  ours; a sibling checkout with a shared prefix is not; a directory that cannot be read
  is not. The driver reads it from `/proc/<pid>/cwd` on Linux and `lsof -a -d cwd`
  elsewhere.
- `stop` now prints what it left alone and why, so the next agent sees the install.
- Verified on this machine with the install running: `stop` reported nothing of this
  checkout running and listed the install's pid with its data directory as left alone;
  `di status` still `running` afterwards.
- Not verified: the `lsof` path (macOS).
