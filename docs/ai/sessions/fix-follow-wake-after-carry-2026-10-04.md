## 2026-10-04 — a followed space carries the edit made right after another at once, not after 20 s

- **What was wrong.** It was measured on aylmo following dev.diiii.xyz, in the `hayfilm` space. After a quiet
  spell an edit crossed in about 0.5 s. But an edit made right after another had crossed waited out the whole
  20-second park, in both directions: aylmo→dev 652 / 21389 / 21482 ms, dev→aylmo 20789 / 20676 / 20697 ms.
  `di follows` said "following" with no error.
- **Why.** Each tick reads every project's log first and parks on the scene's log last. An edit that landed
  between those two steps was lost on either machine:
  - **On the follower:** `wake()` found the loop neither asleep nor parked, so it did nothing, and the park that
    followed held the edit for 20 s.
  - **On the host:** the write released nobody, because the follower had not parked yet. The park, once made,
    checked only the scene's log, which had nothing new.

  A person who edits the moment they see the last edit arrive lands in exactly that gap. It is several round
  trips wide over the internet and microseconds wide on loopback, which is why the existing loopback tests never
  showed it.
- **Fix (the lost-wakeup rule: a signal that can come before the wait must be latched):**
  1. **The follower latches its wake** (`follower.js`, `woken`). The flag is cleared when a tick starts. A wake
     that arrives later keeps that tick from parking and sends the loop straight round. A park abandoned for a
     local edit no longer reports "the other di.iiii is not answering" for one tick.
  2. **The server keeps a change mark per space** (`follow/waiters.js` `changeMark`, from a process name and a
     count of writes). `GET /api/spaces/:id/ops` returns `changeMark`. The follower parks with
     `&mark=<last mark>`, and if anything in the space (its scene or any project) was written since, the park
     answers at once. This is the same method as a blocking query's index (Consul `?index=`, etcd watch
     revision). Only keys someone has asked a mark for are counted, so the machine hub's per-mailbox keys don't
     pile up. Older servers ignore `mark` and older followers ignore `changeMark`. Either way the behaviour is the
     same as before, never worse.
- **Measured.** The new test runs the follow inside the following server, started from its `follows.json` the way
  `di follow` sets it up, and reaches the host through a proxy that delays every chunk 80 ms each way. The edits
  alternate, each made as soon as the last one landed. There are two projects, as in hayfilm.
  - On origin/dev code: follower→host 21091 / 20740 / 20743 ms and host→follower 20782 / 20777 / 20786 ms. That
    reproduces both real failures.
  - With the fix: 745–1090 ms every time (two runs).
  - With only one half of the fix, the other direction returns to 20.7 s, so each half is needed.
  - Not yet measured: aylmo ↔ dev on the real machines. That needs this branch on dev AND on aylmo's installed di.
- **Tests.**
  - New `followIntegration.test.js` block "a followed space answers at once, edit after edit". It checks that all
    six crossings take less than 3 s and that a quiet space still parks (fewer than 12 proxy chunks in 3 s).
  - Four new `waiters.test.js` change-mark cases. These cover: a write made while nobody was parked, a hold
    when nothing changed, a mark from another process, and counting only marked spaces (the route hands marks
    out only for spaces that exist).
  - The existing "never applies the same op twice" test now counts edits and leaves out the follower's own
    convergence write. The faster follow converges the rug/door ordering before that test looks; on origin/dev
    it was still 20 s away.
  - Results: `vitest run serverXR/src/follow/` gives 71 passed (origin/dev code with the new tests: 1 failed, 66
    passed; follower→host 21117 / 20749 / 20756 ms, host→follower 20725 / 20782 / 20741 ms). `npm run test:server-contracts` gives 193 passed. `serverXR/src/machines/` with `statusRoutes` gives
    37 passed. eslint is clean.
- **Owed.** A re-measure on aylmo ↔ dev.diiii.xyz once this has landed on dev and is installed on aylmo.
