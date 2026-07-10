# P2P / IPFS Distribution — Design Proposal

Status: **proposal — needs product-owner review** (MANIFESTO: decentralization-path
decisions are not made from a single task prompt). Nothing here is implemented.

The MANIFESTO's end state: *"Publish → a scene is a hash, not a server URL"* and
*"a scene published today should be retrievable in 30 years without a running
server."* This doc maps what already exists onto that goal and proposes an order
of attack with explicit decision points.

## Where we already are (2026-07-10)

The groundwork happens to be done — each piece shipped for its own reasons:

| Shipped | Why it matters for P2P |
| --- | --- |
| CAS blob store — bytes live once at `spaces/<id>/blobs/<sha256>`, verified against content on upload | sha256 content addressing is IPFS's native currency |
| Space bundles (`space:export/import`) — a space as one secret-free tar.gz | the portable publish unit already exists |
| Install bundles (`install:export/import`) | whole-install portability, same unit nested |
| One-command self-host (`npm run selfhost -- <bundle>`) | "retrievable in 30 years" needs *runnable*, not just fetchable |
| Append-only op-logs (space + project) | the CRDT seed; no history rewrites anywhere |

## The one technical fact that shapes everything

An IPFS CIDv1 with the `raw` codec **is** the sha256 of the bytes (wrapped in a
multihash). Our blob ids convert to CIDs *offline, without re-hashing*:

```
blob 3f2a…9c  →  CIDv1(raw, sha2-256, 3f2a…9c)
```

…but only for **single-block objects**. Files above the IPFS block-size limit
(1 MiB default, 2 MiB hard cap for many gateways) must be chunked into a UnixFS
DAG, whose root CID is a hash of the tree, **not** of the file bytes. So:

- blobs ≤ 1 MiB: our id and the IPFS CID are interchangeable — free win
- blobs > 1 MiB: the mapping `sha256 → rootCID` must be recorded at pin time
  (a tiny JSON sidecar/manifest — we already keep `<hash>.json` refs per project)

No schema change is needed either way; non-negotiable #4 holds.

## Proposed phases

### Phase 1 — "a scene is a hash": pin the bundle (smallest real step)

`scripts/space-ipfs.mjs` (new, ~150 lines, same shape as space-bundle):

1. `export` the space bundle (existing code path)
2. add it to IPFS as a UnixFS file via a local kubo node or a pinning-service
   API (Pinata/web3.storage class; env-keyed, never in the bundle)
3. print `ipfs://<cid>` + gateway URL; store the CID in a new nullable
   `spaces.published_cid` column (ensureColumn migration, display-only)

Import side: `selfhost -- ipfs://<cid>` fetches through a gateway, then runs the
existing import. **A space becomes: hash in, running space out — on any machine
with the repo.** No serverXR runtime changes; the server never talks to IPFS.

Cost: one script + one optional column. Reversible: delete the script.

### Phase 2 — per-asset pinning + viewer gateway fallback

Pin blobs individually (raw CIDs where possible, UnixFS + sidecar above 1 MiB).
The public viewer gains a fetch fallback: asset 404 on the origin server →
try `https://<gateway>/ipfs/<cid>`. This is the "space outlives its server"
property for *live URLs*, not just bundles. Needs product decisions on gateway
choice and whether fallback is opt-in per space.

### Phase 3 — CRDT op-log + WebRTC mesh (separate proposal when its turn comes)

Yjs is the MANIFESTO's candidate. The honest sequencing: **do not start this
until Phase 1–2 are proven**, because it touches non-negotiable #3 and #5
simultaneously (op-log format and serverXR authority). serverXR would become
signaling + archival pin + fallback relay rather than the only truth. This
phase gets its own doc and its own review.

## What this proposal deliberately avoids

- Running an IPFS daemon inside serverXR (cPanel/LVE memory ceiling — the same
  constraint that banned undici; pinning happens from scripts/CI, not the server)
- Any change to auth, publish state ownership, or the op-log format in Phases 1–2
- Token/secret material in bundles or pinned content (already stripped by design)

## Decision points (Gevorg)

1. Green-light Phase 1? (script + `published_cid` column, zero runtime risk)
2. Pinning backend: local kubo (sovereign, needs a box) vs pinning service
   (convenient, a dependency) vs both behind one env interface?
3. Should `published_cid` show in the Share window UI from day one, or stay
   CLI-only until Phase 2?
4. Phase 2 gateway fallback: default-on for public spaces, or per-space opt-in?
