## 2026-10-10 — a follow waits between asks while the other di.iiii answers 502

- Found by di [381bae] in two dev deploy gaps today: every follow on aylmo went round with no pause while dev
  answered 502, 12.6x the usual local load, with the same flood of asks sent to dev.
- Cause: the pass that reads the space's own log counted as a park even when that read was refused, and a
  park longer than 200 ms sends the loop straight round (`follower.js` tick/loop).
- Now a refused read is not a park, and the loop waits 5 s, doubling, at most a minute, until the space's
  log can be read again. Logging is unchanged.
- Measured against a stand-in that answers 502 after 250 ms, for 8 s: old 5 passes / 43 local asks,
  new 1 / 19. The follow tests pass: 137, plus 28 in scripts/di and 37 in machines.
- Not covered: a single project whose log answers 5xx while the space's log answers. That project keeps its
  own write backoff, and its reads are not paced (owed if it is ever measured).
