## 2026-09-05 — five green PRs landed as one batch, so no landing invalidates the next

- Branch protection wants every PR up to date with dev, so five green PRs landed one by
  one would each go BEHIND as the previous one merged. Merged them into one branch off
  dev instead: the verification rules (#364), the lighting tempo grid (#363), the dead
  CSS removal (#274), the room text layer (#285) and the Telegram server half (#282).
  No two touch the same file.
- The dead-CSS note carried a `#` heading instead of `##`, so `land` would have dropped
  its title from CURRENT.md; fixed in place.
- Left for the owner, deliberately: #290 (operator families) rewrites saved documents
  on load and asks for a deliberate yes; #318, #289, #281 conflict on `known-fixes.md`
  and the landing and want a rebase against the reworked front door; #170 is a
  dependency decision.
