## 2026-11-23 — laser shape tests get a 60 s limit, so CI stops failing PRs at random

Why: the laser guard and shape tests sweep every shape over whole loops. On a busy CI runner single tests ran past
vitest's 5 s default ("Test timed out in 5000ms"), so unrelated PRs (1179, 1185, 1271, 1297) failed at random and the
lander skipped them. On studio-mac the same tests take 6-14 s each.

Change: `vi.setConfig({ testTimeout: 60_000 })` in serverXR/src/laser/laserGuards.test.js and
src/project/nodes/laser.shape/laserShapes.test.js. No test logic changed.

Tested: `npx vitest run serverXR/src/laser/laserGuards.test.js src/project/nodes/laser.shape/laserShapes.test.js` = 170 passed
(before the change, laserGuards alone: 5 timed out in 5000ms on this machine).

Also: services/name-broker/test/worker.test.js signs ±125 s instead of ±121 s. Across a second boundary "+121" became 120, inside the window, and CI got 204 on this PR (20:35). Tested: `npx vitest run services/name-broker`.
