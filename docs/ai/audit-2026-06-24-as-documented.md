# Audit A — As Documented · 2026-06-24

**"How it prompts to see."** The project as the AI documentation, manifesto, roadmaps, and state
files portray it — what an agent reading only the docs would *believe* is true. Pair with the
ground-truth half, [audit-2026-06-24-as-built.md](audit-2026-06-24-as-built.md). The
**Documentation-vs-Reality drift** table at the end is the point of running both.

## Documented identity (MANIFESTO.md)

- A **spatial XR authoring platform**. Core loop: open a space → compose a scene → publish to a
  URL → experience in XR.
- **Studio** = main shipped lane; **Beta** = future node-graph lane; **V1** = compatibility.
- Endgame: **decentralized, creator-owned** — "a scene published today should be retrievable in
  30 years without a running server." Asset = hash, CRDT op-log, WebRTC P2P, IPFS, keyless auth.
- 7 non-negotiables: no tokens in the JS bundle · creator owns data · op-log stays CRDT-compatible
  · asset IDs move to content-addressing · `serverXR` is the authority · Studio is the default
  lane · `shared/` is the canonical schema layer.

## Documented status

**CURRENT.md "What works":** Beta editor (graph-first, palette, undo/redo, outliner) · World node
· Studio editor (hub, scene, inspector, assets, spaces, undo) · GLB opt-in optimization on import ·
session-cookie + GitHub/Google OAuth "live and configured on both staging and production" · deploy
pipeline (`dev`→staging, `main`→prod) · Docker stack · space-sync CLI + UI · public spaces via
`isPublic` · per-space read access control · user-scoped sign-in · WCC landing + exhibition.

**V1→Studio parity roadmap:** most Done; *In Progress* = stable public default route, inspector
depth, camera save/default-view UX, 2D/fixed-camera polish, admin/operator route still V1-rooted;
*Later* = switch Studio to production-default editor.

**Dev framework priority order:** (1) auth/role hardening in `serverXR` → (2) decompose biggest
frontend orchestration files (`App.jsx`, `PreferencesPage.jsx`, `StudioShell.jsx`) → (3) reduce
public bundle weight + route-level lazy loading → (4) clean route/admin ownership → (5) DB +
object-storage migration.

**Last full audit (docs/ai/audit-2026-06-22.md):** all automated checks green; open items =
stale `e2e-smoke.mjs`, 3 inconclusive manual items, OAuth round-trip unverified, `server-contracts`
+ `schema-sync` not in CI.

## Documented "broken / open" (CURRENT.md)

VR fly unverified on hardware · `/api/users` OAuth round-trip unconfirmed · ollama Modelfiles
mid-iteration uncommitted · WCC hub `main` project = placeholder cyan sphere · group/hierarchy
node (`group` via `parentId`) decided but unstarted.

## Documented architectural seeds (planted, "not done")

asset IDs → SHA-256 · op-log → CRDT (Yjs) · sync → WebRTC P2P · storage → IPFS · auth → keyless.

## Documentation-vs-Reality drift (the deliverable)

| # | Documentation says | Reality (as-built) | Verdict |
|---|---|---|---|
| 1 | MANIFESTO seed: asset IDs = `crypto.randomUUID()` | SHA-256 content addressing **shipped** for uploads | **Doc stale** — seed is done, table never updated |
| 2 | PROGRESS.md newest entry = 2026-06-22 | 3 sessions of commits since (XR "AR everywhere", Portal Object, landing) | **Journal 3 sessions behind** |
| 3 | CURRENT.md (pre-recap): last commit `b000166`, "dev & main in sync, shipped to prod" | `dev` 3 ahead of `main`; portal+landing **not in production** | Was stale; partly fixed in 06-24 recap |
| 4 | viewport-extraction-plan: "Tier 1 — do first" | Tier 1 **landed** (`EntityContent.jsx`+`buildAssetMap.js`, used by both lanes) | **Plan not marked done**; Tiers 2–3 still open |
| 5 | 06-22 audit: 326 tests | 334 tests | Grew (new portal/viewport tests) — fine |
| 6 | CURRENT.md: OAuth "live and configured on both" vs open item "round-trip unverified" | Providers return `true`, configured; no confirmed end-to-end session | Internal doc tension; "configured" true, "verified" still unproven |
| 7 | Plans reference "9 primitives + lights" | 14 entity types incl. new `portal` | Reality ahead of plan prose |
| 8 | `e2e-smoke.mjs` is a smoke test | Stale fixture/selectors → 16 false negatives | Doc already acknowledges — agreement |

## Conclusion

The documentation is **directionally accurate but trails reality by ~3 sessions**, and one
manifesto seed (content-addressed assets) is silently complete. The *memory layer* — not the code
— is what drifts: when `PROGRESS.md`/`CURRENT.md`/the plan docs aren't updated at session end,
prior work and plan-completions become invisible and feel "lost." Keeping the journal current and
marking landed plans Done would close every drift row above except #6 (a genuine open verification).
