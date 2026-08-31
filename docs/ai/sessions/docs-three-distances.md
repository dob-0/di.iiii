# Session notes — docs/three-distances

## 2026-08-31 — Three Distances: the owner's shape for local, LAN, and hosted, written down

- New `docs/architecture/THREE_DISTANCES.md`: one product at three distances —
  this machine (the show runs here, offline), this network (festival LAN:
  stages, rigs, phones, live control), the world (thedi.studio = "our local
  that happens to be public"; sync and sharing). The rule that falls out: the
  internet is for sharing, never in the signal path of a running show.
- The doc records why two existing walls ARE the architecture (https cannot
  reach a http rig; vizzz fleet is distance two already) and sketches the
  sync door in three steps: (1) originId + per-peer sync ledger so
  /api/sync status can say ahead/behind/diverged instead of unknown;
  (2) peer list + LAN discovery, Sync control on the space card;
  (3) op-level exchange riding non-negotiable #3's CRDT discipline.
- MANIFESTO "Where It Is Going" gained one paragraph pointing at the doc —
  recording the owner's stated direction, not inventing one.
- Docs only; no runtime code touched.
