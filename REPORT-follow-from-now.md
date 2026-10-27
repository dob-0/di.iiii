# Report: follow from now + F4 (branch fix/follow-from-now-2026-10-04, PR #757, not merged)

Files: serverXR/src/follow/{follower,followConverge,followStore,index}.js (+ tests followConverge.test.js, followIntegration.test.js),
serverXR/src/routes/{spaceRoutes,projectRoutes}.js (restore point for whole-work ops), scripts/di/{cli,follow,follows,ui}.mjs + follows.test.js,
docs/architecture/SPEC_follow.md, docs/ai/sessions/fix-follow-from-now-2026-10-04.md.

Commands for moxir (run by the main session, not me), key from `di invite moxir` on dev:
  di follow moxir --from https://dev.diiii.xyz --key - --into moxir --from-now
  # if `di follows` then shows "this copy holds N ... the host lacks" and the host should win:
  di follow moxir --from https://dev.diiii.xyz --key - --into moxir --from-now --take-host
  # (--take-mine instead pushes aylmo's copy up). Direction is spent after the first comparison.
  The server restarts that follower itself when a new direction appears (cursors saved).

Tests (npx vitest run serverXR/src/follow scripts/di): before 395 passed / 1 failed of 396; after 677 passed / 1 failed of 678 on a wider set
(adds serverXR/src/routes, projectContracts, syncContracts). The 1 failure, scripts/di/openFile.test.js "introduces itself with the release version",
fails identically on origin/dev (unrelated). New: 5 integration (4 red on origin/dev, the 5th a smoke test), 6 converge unit, 2 CLI.
One existing test (followIntegration "agrees on the host's value...") now passes start:'replay' - it restarts with no saved state and needs the
offline edits to cross as ops.

Limits: not run on a real install. First tick decides from-now (saved state => unchanged). A project on one side only still replays.
Restore point id is logged only if the key may list /snapshots, else it says the write route took it. A whole-work op as ops now always takes
a restore point (route change, new reason before-whole-replace-op). New integration tests are slow (~20 s each, first tick waits the park).
Conflicts with #750/#751/#752 expected in follower.js/followStore.js/cli: mechanical. #751's `merge` refusal (at follow time) is separate from
this converge refusal; --into is still required for an existing space. tools/lint-words.sh does not exist in this tree; not run.
