# Hand-over to the cloud — 2026-10-14 15:3x (aylmo powered off at 15:40 by the owner)

Owner ledger rows N637–N650 (ledger file lives on aylmo: ~/work/OWNER_REQUESTS_2026-09-30.md — not reachable from the cloud).

## State
- MERGED to dev: #931 (laser path guards), #933 (laser research + decisions: docs/ai/research/*-2026-10-14.md, docs/ai/decisions/2026-10-14-raw-laser-workflow.md).
- **#932** (Laser Out Arm/Disarm + Find cubes + same-origin/proxy guard): reviewed MERGE (two rounds), dev merged in at a8d0234e (3 engine conflicts resolved keeping both sides; 142 laser tests passed). CI was re-running at 15:33.
  **The owner authorized: "you can merge them when ci is green"** → merge #932 with `gh pr merge 932 --merge` once build-and-test AND browser-checks pass and mergeStateStatus is CLEAN (update-branch if BEHIND).
- **#934** Phase 1 Geometry → Laser (Laser Trace / Laser Merge / point budget): built, 10542 tests passed; waits for #932 → rebase on dev, adversarial review, then the owner's look on the real cubes. Design: docs/ai/research/raw-laser-workflow-design-2026-10-14.md; owner's decisions: docs/ai/decisions/2026-10-14-raw-laser-workflow.md.
- di.bo dropped forwarded TEXTS (only files saved): HARD RULE written (owner's ~/.claude/CLAUDE.md "Every message reaches the work"); fix in progress in the di-bo repo (branch pushed if the agent got there); deploy needs r-di rehearsal + Mac safe route (needs aylmo/tailnet).
- Jam tonight 20:00 (Jam Discipline #4): runbook 2026-10-14-jam-runbook.md, 5 screens 640×1440 = one 3200×1440 display (Nikita), project "Jam 5 screens" in space di-laser (synced to dev), test pattern png here. PONYO (Emilya) drives cubes + screens.
  **aylmo is OFF → the cube switch has no DHCP: plug the D-Link into the venue router.**
- Cubes: 2 × LaserCube Ultra Mk2 7.5W fw 1.17, serials 8cbfea06ab30 / 8cbfea06aa5c; discovery only by unicast (0x27/0x77), not broadcast.

## Next, in order
1. Merge #932 when green (authorized). 2. Rebase #934, review it. 3. Phase 2 (beat + oscillator, TD-style master clock with extra clocks) per the design. 4. Network + screens sync design (main task N647) using 2026-10-14-lasercube-network-modes.md and the 5-screen spec.
Never arm or send to real cubes from the cloud.

## di.bo root cause (found 15:3x)
Door bot keeps only messages with a file (`keepsThis` needs `fileOf`); owner texts get the hourly "relay is not on this door" reply and are dropped; edits, stickers, forward origin lost too. Branch `fix/keep-every-message` in di-bo pushed EMPTY. Full design: 2026-10-14-dibo-missed-messages.md. Deploying before 2026-10-21 10:57Z recovers the 10-14 texts.

## Emilya (PONYO) — her session "DI mapping software local setup" (emily-5a)
PONYO di 0.4.16-connect.4 at http://localhost:4001 (not diiii.localhost); she maps in main/jjjjjjjjjjjjj, 3200x1440 one surface. She decides whether to follow di-laser for "Jam 5 screens".
