# Studio ↔ Beta: Shared vs Forked Map

> Pure-code analysis (no AI/agent docs read). Generated from import graph + file inspection on branch `dev`.
> **Corrected 2026-07-16**: the original version of this doc (see git history) claimed 7 files
> under `src/beta/{state,services,hooks,import}/` were still "1-line re-export shims, safe to
> delete." That work had already been done and the files/directories no longer exist — checked
> directly against the filesystem, not re-derived from an old grep. Line counts below were also
> re-measured directly (`wc -l`) rather than trusted from the original pass; several had drifted
> (e.g. `src/beta/` is ≈3.8k lines now, not ≈5.5k). Treat any claim in this doc as needing a fresh
> check before being relied on for a real change — it drifts as the code moves and nothing
> currently regenerates it automatically.

## TL;DR

The **model/data layer is fully unified** in `src/project/`; the **view/controller layer is forked** into two parallel editors; and each fork has **accreted unique features the other lacks**. Consolidation is therefore *not* a delete-one-side job — the two surfaces have diverged in **capability**, not just styling.

```
            ┌─────────────────────────────────────────────┐
            │  src/project/  (SHARED single source of truth)│
            │  store · sync · api · presence · registries   │
            └───────────────┬─────────────────┬────────────┘
                            │                 │
          ┌─────────────────▼───┐     ┌───────▼──────────────┐
          │   src/beta/ (≈3.8k) │     │  src/studio/ (≈8.9k) │
          │  node-graph editor  │     │  shell+gizmo+XR edit │
          └─────────────────────┘     └──────────────────────┘
                            │                 │
            ┌───────────────▼─────────────────▼────────────┐
            │  src/objectComponents/ (SHARED 3D primitives) │
            └───────────────────────────────────────────────┘
```

---

## 1. Shared — single source of truth

### Data / sync / state core — `src/project/`
Both surfaces import these directly:

| Module | Role |
|---|---|
| `state/projectStore.js` | canonical document store (both `BetaEditor` & `StudioEditor` import `useProjectStore` from here) |
| `services/projectsApi.js` | REST client + `buildProjectAssetUrl` |
| `services/projectSyncService.js` | live sync transport |
| `hooks/useProjectDocumentSync.js` | doc ↔ server reconciliation |
| `hooks/useProjectPresence.js` | multi-user presence |
| `import/importLegacyScene.js` | legacy scene migration |
| `entityRegistry.js`, `nodeRegistry.js` | type registries |
| `transfer/studioProjectBundle.js` | export/import bundle (studio-named, lives in shared) |
| `components/PublicProjectViewer.jsx` | public read-only viewer |

**Key finding (updated):** `src/beta/` has no data-layer files of its own at all anymore — the
re-export shims this doc previously described have already been deleted, and every Beta component
imports `src/project/` directly (e.g. `BetaEditor.jsx` imports `useProjectStore`,
`useProjectDocumentSync`, `useProjectPresence`, `getInspectorSections`, `createEdge`/`createNode`/
`getNodeType`, and `DEFAULT_PROJECT_SPACE_ID` straight from `../../project/...`). There is nothing
left to delete here — this line item is done.

### 3D object primitives — `src/objectComponents/` (11 files)
`BoxObject · SphereObject · ConeObject · CylinderObject · Text2DObject · Text3DObject · ImageObject · VideoObject · AudioObject · ModelObject · ObjectMap`. **Both** viewports render the identical leaf primitives (10 import lines each, byte-identical).

### Schema — `src/shared/projectSchema.js`
Studio imports it in 4 places, beta in 1.

### Misc shared
`src/components/GridFloorBackground.jsx`, parts of `src/hooks/`, `src/services/`.

### Cross-link (navigation only — not real coupling)
- `StudioHub.jsx` imports `buildBetaHubPath` from `beta/utils/betaRouting.js`
- `BetaHub.jsx` imports `buildStudioHubPath` from `studio/utils/studioRouting.js`

A single path-builder function each, used only to render a link to the other surface. Deliberate, harmless.

---

## 2. Forked — parallel implementations of the same role

Each row is the *same responsibility* built twice, independently.

| Responsibility | Beta | Studio |
|---|---|---|
| App entry | `BetaApp.jsx` (19) | `StudioApp.jsx` (95) |
| Hub / home | `BetaHub.jsx` (271) | `components/StudioHub.jsx` (365) + `SpaceHub.jsx` |
| Editor shell | `components/BetaEditor.jsx` (1142) | `components/StudioEditor.jsx` (1125, **not** `StudioEditor.jsx` at the package root — nested under `components/` like Beta's) + `components/StudioShell.jsx` (643) + `components/StudioShellPanels.jsx` (1774) |
| **Viewport** | `components/BetaViewport.jsx` (370) | `components/StudioViewport.jsx` (944) |
| Inspector | `components/PropertyInspector.jsx` (153) | `components/StudioInspector.jsx` (460) |
| Routing | `utils/betaRouting.js` (117) | `utils/studioRouting.js` (105) |
| Layout model | `utils/windowLayout.js` (47, free-floating windows) | `useViewportLayout` + `useStudioLayoutPrefs` + `useStudioPanelState` (docked panels) |

(Line counts re-measured 2026-07-16 via `wc -l`; the previous pass's numbers had drifted —
`StudioShellPanels.jsx` in particular grew from 986 to 1774 lines since this doc was written.)

### Viewport fork detail (the most expensive divergence)
Both wrap the **same** `objectComponents` primitives, but the camera/control/selection shell is entirely separate:

| | BetaViewport (370) | StudioViewport (944) |
|---|---|---|
| Camera/controls | `OrbitControls` + `Grid` (drei) | `CameraControls` + `TransformControls` (drei) |
| Selection/transform | none (graph-driven) | gizmos + `ModalTransform` + `multiTransform` |
| XR | — | `@react-three/xr` (`XR`, `useXR`) |
| Extra runtime | `createNodeGraphContext`, `evaluateNodeInputs` | `applyPivotTransform`, `getSelectionCentroid`, `useFrame` |

So camera, controls, selection, and per-frame logic are duplicated — only the leaf meshes are shared.

---

## 3. Conceptually unique — genuinely different paradigms (not just forks)

These have **no counterpart** on the other side. This is why neither surface can simply replace the other.

### Beta-only — node-graph + floating-window editor
- **Node-graph editing:** `utils/nodeGraphRuntime.js`, `NodePalette.jsx`, `BetaGraphSurface.jsx`, `OpCreateDialog.jsx`, `utils/nodeInspectorSections.js`, `utils/nodeSurfaceFilters.js`
- **Floating "desktop window" UI:** `DesktopWindow.jsx` + `ImagePanelWindow` / `TextPanelWindow` / `WorldPanelWindow` / `OutlinerPanelWindow`
- **Onboarding/workflow:** `utils/surfaceWorkflow.js`, `utils/betaGuide.js`, `BetaHelpDialog.jsx`
- **Misc:** `BlankNodeWorkspaceApp.jsx`, `utils/localWorkspaceStorage.js`, `utils/deviceDetection.js`

### Studio-only — spatial/XR authoring + production pipeline
- **XR authoring:** `@react-three/xr` integration in the viewport
- **Transform tooling:** `ModalTransform.jsx`, `utils/multiTransform.js` (multi-select pivot transforms)
- **Presentation mode:** `StudioPresentationSurface.jsx` (+ `utils/presentationTemplates.js`)
- **GLB asset-optimization pipeline:** `utils/assetOptimization.js`, `utils/optimizeGlbAsset.worker.js`, `AssetOptimizationDialog.jsx`
- **Docked-panel chrome:** `StudioControlCluster.jsx`, `StudioQuickInsert.jsx`, `StudioFloatingPanel.jsx`, `StudioViewportLayout.jsx`

---

## 4. Implications for consolidation

1. **The hard part is already done.** The data/sync/state layer is unified in `src/project/`; both editors are thin clients of it. Picking a "winner" does **not** risk the document model.

2. **The fork is the view layer + paradigm.** Studio = WYSIWYG spatial editor (gizmos, XR, presentation, asset pipeline). Beta = node-graph + floating windows. Choosing one means either **porting** the other's unique features or **dropping** them — a product decision, not just a refactor.

3. **Cheapest immediate wins (no product decision needed):**
   - ~~Delete beta's 7 re-export shim files; repoint beta's internal imports at `src/project/` directly.~~ **Done** — no shim files remain, Beta already imports `src/project/` directly.
   - `betaRouting.js`/`studioRouting.js` (117/105 lines) and `betaGuide.js`/`studioGuide.js` (156/159
     lines) are near line-for-line duplicates differing only in naming — candidates for one shared
     parameterized module, still outstanding.
   - Extract the duplicated viewport shell (camera/controls/selection/per-frame) into a shared `src/project/viewport/` the way `objectComponents` and the store were extracted. The leaf primitives are already shared; the wrapper is the remaining duplication. Still outstanding.

4. **If Studio is the intended canonical surface** (it has XR, presentation, and the asset pipeline — the production-facing features), the open question is whether Beta's **node-graph authoring** is a feature to migrate into Studio or to retire. That single decision determines whether Beta can be deleted or must be absorbed.

---

## Appendix — method

- Import graph: `grep` for `from '…'` across each surface, grouped by target directory.
- Shim detection: `head -3` / `wc -l` on beta's data-layer files.
- Shared-primitive confirmation: identical `objectComponents` import blocks in both viewports.
- Line counts from `wc -l`. No runtime/agent docs consulted.
- 2026-07-16 correction pass: re-ran `wc -l` on every file cited in this doc and re-grepped for
  the shim files' existence before trusting the original numbers — see the note at the top.
