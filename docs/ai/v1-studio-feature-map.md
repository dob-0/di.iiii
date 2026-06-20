# V1 → Studio Feature Map

Audited 2026-06-20. Use this before building any Studio feature to check if V1 had it and how it was done.

---

## What both editors share (parity)

Box, Sphere, Cone, Cylinder, Text 2D/3D, Image, Video, Audio, Model — all present both sides.
Transform gizmo (translate/rotate/scale), single + multi-select, orbit camera, grid, undo/redo, keyboard shortcuts, object visibility toggle, asset import.

---

## V1 has → Studio gap (concepts worth porting)

### High priority

| Concept | V1 implementation (what NOT to copy) | Studio target |
|---|---|---|
| **Structural grouping** | localStorage selection-recall, `window.prompt()`, no schema | `group` entity type + `parentId` already in schema; StructurePanel tree indent; wrap-selection action |
| **Object linking** | `SelectableObject` — `link.url` + click/hover | New entity component `link { url, target }`; inspector field; click handler in viewport |
| **Expressions on transform** | String eval in `SelectableObject` per-frame | Expression component on entity; eval in viewport render loop |

### Medium priority

| Concept | V1 | Studio target |
|---|---|---|
| **Render settings in UI** | `ViewPanel` → tone mapping, exposure, DPR | Fields in ProjectPanel → world settings section |
| **Grid fine-tuning** | `WorldPanel` — cell size, thickness, fade | Extend world settings; already has grid on/off |
| **Orthographic camera** | `ViewPanel` toggle | Camera component or global scene setting |
| **Fixed camera / presentation camera** | `ViewPanel` — locked cam with FOV, zoom, near/far | PresentPanel locked-camera mode |
| **Media variant switching** | `AssetPanel` + `InspectorPanel` per-asset | Per-entity media component field; already has assetId |

### Low / intentionally deferred

| Concept | Decision |
|---|---|
| Selection groups (localStorage) | Replaced by structural `parentId` grouping |
| Local save/load | Studio is cloud-native; server is source of truth |
| Space creation from editor | Handled via admin/CLI, not in-editor |
| `window.prompt()` / `alert()` dialogs | Studio uses inline UI for everything — never copy |
| Offline/local mode | Deferred; no offline requirement yet |

---

## Studio has → V1 didn't (keep, don't regress)

| Studio feature | Where |
|---|---|
| Lights as scene entities (point, spot, dir, ambient) | `StudioViewport`, entity-component schema |
| Real-time collaborative presence | `ActivityPanel`, `useCollaborativeSession` |
| CRDT / op-log document sync | `src/project/` |
| Entity-component architecture | `projectSchema` |
| Advanced inspector (wheel, shift/ctrl step, vector rows) | `StudioInspector` |
| Gizmo axis locking | `StudioControlCluster` |
| Modal transform | `ModalTransform` |
| Device-aware layout persistence | `useStudioLayoutPrefs` |
| Project bundle export/import | `studioProjectBundle` |
| Live publishing | `PublishPanel` |
| Project metadata (name, description, tags, thumbnail) | `ProjectPanel` |
| File/code management | `FilesPanel` |

---

## Schema notes

- `parentId` is already on every node in `projectSchema.js` (`normalizeProjectNode` line ~508).
- `deleteNode` already cascades to all descendants (line ~694).
- A `group` entity type needs no schema migration — just a new entry in the node registry and a viewport component that renders nothing (or a bounding-box helper).
- `link` component similarly needs only a registry entry and a new component field block.
