# Step 2 — Viewport Shell Extraction: Scope & Plan

> Pure-code scoping of the shared viewport layer. Read after `studio-beta-fork-map.md`.

> **Status (2026-06-24): Tier 1 LANDED.** `src/project/viewport/EntityContent.jsx` +
> `buildAssetMap.js` (+ `EntityContent.test.jsx`) exist and are the canonical leaf renderer for
> Studio and Beta; the entity→object switch is no longer duplicated 4×, and `portal` was added as
> a 14th case. **Tier 2** (`CursorOverlay` + `useViewportCursorPresence`) and **Tier 3**
> (`SceneEnvironment`) are still open — those files do not exist yet.

## Correction to the earlier framing

"Extract the viewport **shell**" is too broad. After reading both viewports in full, the outer shell (`<div class="*-viewport-shell">` → `<Canvas>` → controls) is **genuinely forked and should stay forked** — Beta uses `OrbitControls` + node-graph placement; Studio uses `CameraControls` + `TransformControls` + XR + `ModalTransform`. Forcing those together would couple two real control schemes.

What *is* duplicated — and worth extracting — is the **in-Canvas scene-content layer** (the leaf rendering) and a couple of **DOM overlays**. These have zero coupling to either control scheme.

## The headline finding: the entity→object switch is duplicated 4×

The `entity.type → objectComponents` mapping exists, near-identical, in **four** files:

| File | Fn name | Notes |
|---|---|---|
| `src/studio/components/StudioViewport.jsx:24` | `EntityContent` | **superset** — adds `wireframe`/`opacity` props + 4 light-entity cases (`pointLight`/`spotLight`/`directionalLight`/`ambientLight`) |
| `src/beta/components/BetaViewport.jsx:43` | `EntityVisual` (inline `content`) | subset — no wireframe/opacity, no lights |
| `src/components/LiveProjectScene.jsx:64` | `EntityVisual` | has opacity; runtime/animation playback wrapper |
| `src/wcc/scene/WccExhibition.jsx:98` | `EntityVisual` | has wireframe/opacity |

Same nine primitive cases (`box · sphere · cone · cylinder · text · image · video · audio · model`), same prop names, same `default → BoxObject`. The asset lookup (`media.assetId ? assetMap.get(...) : null`) is identical in all four. **This is the single most duplicated piece of 3D code in the repo** and the reason "fix it twice" keeps happening (same root cause as the duplicated `Walker`).

---

## Extraction tiers (ranked by value ÷ risk)

### Tier 1 — `EntityContent` + `buildAssetMap`  ← do first
**Highest value, lowest risk. Collapses 4 copies → 1.**

New file `src/project/viewport/EntityContent.jsx`:
- Move Studio's `EntityContent` (the superset incl. light-entity cases + `wireframe`/`opacity`) verbatim — it is already a standalone, side-effect-free function taking `{ entity, assetMap }`.
- It becomes the canonical leaf renderer for all four call sites.

New file `src/project/viewport/buildAssetMap.js`:
- Promote Studio's smarter version (`StudioViewport.jsx:547`) that falls back to `buildProjectAssetUrl(projectId, asset.id)` when an asset has no URL — the legacy-import gap. The other three use the naïve `new Map(assets.map(...))` and silently fail to render those assets; sharing the smart one is a **bug fix for Beta/WCC/Live as a side effect**.

Call-site changes (swap inner switch, keep each surface's wrapper):
- `BetaViewport.jsx` — `EntityVisual` keeps its `<group>` + selection-pill + `onClick`; replace the inline `content` switch (lines ~49–119) with `<EntityContent entity={entity} assetMap={assetMap} />`. Beta gains wireframe/opacity/light rendering for free (harmless).
- `StudioViewport.jsx` — delete the local `EntityContent`, import it. `SelectableEntity` already calls `<EntityContent .../>` — no other change.
- `LiveProjectScene.jsx` / `WccExhibition.jsx` — replace their `EntityVisual` body's switch with `<EntityContent/>`; keep their animation/zone wrappers.

Risk: **low.** Pure render mapping, prop names already match across all four. Verify the four `objectComponents` import paths resolve from the new location (`../../objectComponents/` → adjust to the shared module's relative depth). Studio entities with light types already render; Beta/WCC/Live rarely carry light-type entities, so the superset is additive.

Net: **−~280 duplicated lines**, one source of truth for "how an entity becomes a mesh."

### Tier 2 — `CursorOverlay` + presence-pointer hook
**Low risk, small, collapses Beta+Studio (and likely the presentation surface).**

`BetaViewport.jsx:426-439` and `StudioViewport.jsx:1050-1063` render an identical presence-marker layer (only the className prefix differs). The `handlePointerMove` normaliser (`BetaViewport.jsx:355-364` = `StudioViewport.jsx:931-940`) is byte-identical.

- New `src/project/viewport/CursorOverlay.jsx` — takes `{ cursors, classPrefix }`.
- New `src/project/viewport/useViewportCursorPresence.js` — `(viewportRef, onCursorMove) → handlePointerMove`.

Risk: **low.** DOM-only, no Three.js. `classPrefix` prop preserves each surface's CSS.

### Tier 3 — `SceneEnvironment` (background + lights), optional `SceneGrid`
**Medium risk — defer until Tier 1–2 land.**

Both scenes set `<color attach="background">` + `<ambientLight>` + `<directionalLight>` from `worldState` with the same default colors/intensities. The difference: Beta resolves values through the node graph (`resolvedLight ?? worldState ?? hardcoded`) while Studio reads `worldState` directly.

- New `src/project/viewport/SceneEnvironment.jsx` taking already-resolved `{ background, ambient, directional }` props (each surface does its own resolution and passes the result). Keeps node-graph logic in Beta, dumb-renders in Studio.
- `SceneGrid`: shareable but Studio's `<Grid>` is heavily parameterised (cellSize/thickness/section*/fade*) while Beta's is minimal and node-driven. Either share with many optional props or leave forked. **Recommend leaving grid forked for now** — low duplication payoff, higher divergence.

Risk: **medium** — lighting defaults must stay pixel-identical per surface; snapshot the before/after visually.

---

## Explicitly NOT shared (real forks — do not touch)

| Concern | Beta | Studio |
|---|---|---|
| Camera + controls | `OrbitControls` | `StudioOrbit`/`CameraControls` (FOV lerp, ortho pan, XR-aware) |
| Selection / transform | none (graph-driven) | `SelectableEntity` + `MultiSelectionGizmo` + `TransformControls` + `BoxHelper` |
| Hierarchy | flat | `SceneEntityNode` group recursion |
| XR | — | `<XR store>` |
| Placement UX | double-click ground plane → node, drag-on-plane | `ModalTransform`, quick-insert |
| Chrome | empty-hint placeholder | `ViewportToolbar`, `HotkeyHelp`, `FullscreenButton`, transform HUD |
| Node rendering | `NodeVisual`/`renderNodeBody`/`evaluateNodeInputs` | — |
| Render settings | — | `RenderSettingsEffect` |

These are the legitimate reasons the two editors exist separately. Node-graph rendering stays in Beta (confirmed keeper).

---

## Proposed target layout

```
src/project/viewport/
  EntityContent.jsx              # Tier 1 — canonical entity→mesh switch (from Studio)
  buildAssetMap.js               # Tier 1 — asset map + URL fallback
  CursorOverlay.jsx              # Tier 2 — presence markers (classPrefix prop)
  useViewportCursorPresence.js   # Tier 2 — pointer→normalized x/y
  SceneEnvironment.jsx           # Tier 3 — background + ambient + directional
  EntityContent.test.jsx         # new — covers all 9 primitives + lights + asset fallback
```

(Mirrors how `state/`, `services/`, `hooks/` already live under `src/project/`. Per `src/project/AGENTS.md`, shared cross-lane logic belongs here.)

## Sequencing

1. **Tier 1** as its own PR — biggest win, self-contained, four call-site edits + new tests. Land and verify before anything else.
2. **Tier 2** as a second small PR.
3. **Tier 3** only if Tier 1–2 are clean; treat as optional polish.

Do **not** bundle the tiers — Tier 1 alone is the 80%.

## Validation per tier

```bash
npm run lint
npm run test           # add EntityContent.test.jsx
npm run build
```
Plus a manual visual check (the repo has Playwright in devDeps and a `/run` skill): open a project in **both** Studio and Beta and confirm primitives, textures, opacity, and selected-state still render. For Tier 1, also load a legacy-imported project to confirm the asset-URL fallback now renders assets that previously didn't.

## Risks & watch-outs

- **Relative import depth:** moving the switch changes `../../objectComponents/` paths — recompute from `src/project/viewport/`.
- **Beta light entities:** the superset will now render `pointLight`/etc. entity types in Beta. Confirm Beta documents don't intentionally suppress them (very unlikely — Beta drives lights via `world.light` nodes, a separate path).
- **`document` shadowing:** `StudioViewport.jsx` already has a `FullscreenButton` that uses the global `document` while the component prop is also named `document` — unrelated to this change, but don't propagate that shadow into shared files (name the param `projectDocument` in shared modules).
- **No behavior change intended:** every tier is a pure de-dup. Any pixel diff is a bug, not a feature.

## Expected impact

- Tier 1: ~−280 lines, 4→1 leaf renderer, fixes a latent asset-render bug in 3 surfaces.
- Tier 2: ~−40 lines, 2–3→1 presence overlay.
- Tier 3: ~−30 lines, shared lighting.
- Net once all land: one place to fix "how the scene draws," which is exactly where the repeated-fix tax lives today.
