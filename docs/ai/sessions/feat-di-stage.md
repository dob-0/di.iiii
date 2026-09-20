## 2026-09-20 — `di stage` — the venue box is a command now, not a hand-made setup

Step C of `~/work/di-atlas/decisions/2026-09-20-di-stage-plan.md`: one autostart entry,
one supervisor, one screen. `RIG.md` said the appliance was "hand-made on asuz, not in
the product"; it now says what is in the product and what is still hand-made.

- `di stage join SPACE --from URL [--key K|-] [--at ADDR] [--lan] [--name N] [--project ID]
  [--browser P] [--dry-run]`, `di stage leave [--keep-space]`, `di stage status [--json]`,
  `di stage restart`, and the hidden `di stage run` the autostart entry calls.
- **Composed, not duplicated.** `cmdFollow`'s body is now `followSpace()` in
  `scripts/di/follow.mjs`, used by both `di follow` and `di stage join` — so the address
  pin (`--at`) works on a stage join for free. `alive`/`publicUrl`/`apiBase` moved out of
  `cli.mjs` into `state.mjs` for the same reason. The server is always started through
  `runnerFor(home).start`; there is no second spawn path.
- **The manifest is the contract.** `<DI_HOME>/stage/stage.json` records every file, every
  directory, the `di.env` lines and the follow that `join` created, plus the commands that
  remove the OS entry. `leave` replays that list and nothing else.
  `scripts/di/stageAutostart.test.js` proves a temp HOME and a temp `XDG_CONFIG_HOME` come
  back byte-identical — including an unrelated follow left untouched, an earlier follow of
  the same space put back with its original `followedAt`, and a hand-spaced `di.env` line
  not rewritten. `follows.mjs` gained `setFollow` for exactly that: `addFollow` stamps a
  new timestamp, and a restore may not.
- **Everything decided is pure.** `scripts/di/stagePlan.mjs` returns `{kind, path, content,
  install[], remove[]}` for each autostart entry, the browser args, the reconcile, the
  status rows, the Preferences patch, the wake command. CI is Linux, so the Windows
  scheduled task and the macOS LaunchAgent are covered by those snapshots and by an
  injected command runner — they were NOT run on their own OS, and the PR says so.
- **Four defects the first real run found, each now a test:**
  a kiosk that loaded the hold page before the target was known never moved (rewriting the
  file under a loaded page changes nothing); a relaunch into the same profile hands the URL
  to the running browser and exits, so child-process liveness read "dead" and stacked a new
  tab every tick — liveness is now "does CDP answer", and the running kiosk is ended by the
  pid in the profile's `SingletonLock`; `exit_type: Normal` stops the crash bubble but not
  the session restore, so the session files come off the profile before each launch; and
  the black-out on a dead server now happens BEFORE the server restart is attempted, not
  after a call that can block for thirty seconds.
- Seen end to end on aylmo against two throwaway installs under the session scratchpad
  (4420 and 4421; the owner's live di.iiii on 443 was never touched and its pid never
  changed). Join, the kiosk black then `out · wall · ok`, `di stage status` exit 0, `di down`
  warning that the supervisor will undo it, the wall going black when the server stopped and
  coming back by itself, `status` exit 1 with the reason while it was down, and `leave`
  leaving only the di.iiii server's own `data/` behind. No autostart entry was installed on
  this machine: `~/.config/systemd/user` and `~/.config/autostart` are byte-identical and
  systemd has zero `di-stage` units.

**Not in this PR, deliberately:** the plan's step D — displays as data (`output.show`), OS
display probes, multi-window placement, hotplug reconcile. One screen, a static target: the
space's single map project or `--project`. A second projector on asuz is still hand-made.

**Open doubt:** the demo seeded the mapping on both sides with a whole-document PUT, which
produces a `replaceDocument` op — and `serverXR/src/follow/followPlan.js` deliberately never
carries those. So this run showed `di stage`, not a follow carrying a mapping; the follow
engine correctly reported "one side replaced a whole scene — that is not carried by a
follow". A mapping authored through ordinary ops would travel.
