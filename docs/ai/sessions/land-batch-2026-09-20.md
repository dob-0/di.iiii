## 2026-09-20 — landing the rig session's twelve branches as one batch

Twelve green PRs, each BEHIND `dev`, landed together as one merge branch rather than
one at a time (`feedback-batch-land-behind-prs`): the rig's two-machine work, the
artist's path into projection, and two new lanes.

- Three files needed a real integration rather than "take one side", because two
  branches each added something to the same place: `serverXR/src/httpClient.js` (the
  address pin from `feat/follow-at` had to be threaded through the file-transfer
  helpers from `feat/follow-files`, or a pinned follow would carry its ops to the
  pinned address and its FILES wherever DNS pointed), `src/map/MapSourceView.jsx`
  (the `stream` source and the brought-in-file retry/placeholder), and
  `src/studio/components/StudioControlCluster.jsx` (Projection and Lights, two
  branches adding a button to one row).
- `docs/ai/known-fixes.md` conflicted five times; it is an append-only table, so every
  conflict keeps both sides in order.
- The merged tree was checked against `build/rig-all` — the tree packed as
  0.4.14-wstream.8 and running on both rig machines — and differs only by the NDI
  receive lane (held back, its branch is still being worked) and by the fixes that
  landed after that build was packed.
- `serverXR/src/ndi` and PR #506 are deliberately NOT in this batch.
