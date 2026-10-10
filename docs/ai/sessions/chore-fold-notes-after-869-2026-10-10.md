## 2026-10-10 — fold 46 session notes after #869 (the land job cannot push to protected dev)

- **What:** dev's `land` job folded but could not push (GH006, run 38047290868); 46 notes waited on dev and
  CURRENT.md's last recap was 2026-10-07, so every branch push dated 2026-10-10 failed the freshness gate.
- **How:** `scripts/session-land-lib.mjs` (`foldNotesIntoProgress`, `buildLastSessionSection`,
  `replaceLastSessionSection`) run on a fold branch off origin/dev c8fcb7f0, as the repo's own fold-branch route
  (examples #653, #654); notes deleted; CURRENT.md 47 lines (cap 50).
- **Owed (owner's call, unchanged):** a ruleset bypass actor (GitHub App / token) for the land job, or a job that
  opens its fold as a PR — until then every landing needs this by hand.
