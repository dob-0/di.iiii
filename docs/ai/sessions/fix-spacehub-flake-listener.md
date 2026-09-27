## 2026-09-27 — the SpaceHub flake was a lost message, not a slow runner

- `SpaceHub.test.jsx` failed CI three times (#536, #548, one earlier) at the wait after the stub message.
  Cause: the card's `message` listener is attached in a passive effect that runs after the iframe is in
  the DOM; the test posted in that gap on a loaded runner and the message was lost. Timers could not fix it.
- Fix: `settleEffects()` (`act(async () => {})`) before each posted message, in the three tests that post one.
- Measured: 48 parallel runs under load — old 42/48, fixed 48/48. Known-fixes row added.
