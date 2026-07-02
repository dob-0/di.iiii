# Studio Content Model — UX Roadmap

Written 2026-07-02, after the five-window consolidation. Tracks how Studio's
content management converges on one mental model: **files → entities → code**,
inspired by PlayCanvas/Unity (scripts and media are one asset library; the
hierarchy shows objects; the inspector shows the selection).

## The problem this solves

Users experienced content as fragmented: code files, asset files, and objects
lived in different windows with different names and no visible connections.
Concretely (verified in code before Phase 1):

1. "Code" files aren't files — they live in `presentationState.codeFiles`
   inside the document, and showing them replaces the 3D viewport.
2. The switch that made code visible lived in the Share window, not Code.
3. Two asset stores behaved differently behind one panel: "Import assets" →
   project assets; Drive/Commons → space assets. Space assets were invisible
   to the Inspector until "+ Add" silently adopted them.
4. The same space-asset list rendered three times under two names.
5. Assets could never be deleted, had no used-by view; code files couldn't be
   renamed; `codeSourceType:'url'` was consumed by renderers but unreachable.

## Phase 1 — shipped (2026-07-02)

- **One Files library** in Create: project + space assets merged by
  content-hash id; residency shown as provenance (`project` / `space` /
  `project · space`); badges `in scene ×N` and `public`; one action row
  (+ Add / Share / URL / delete).
- **Delete with used-by protection**: `DELETE /api/projects/:id/assets/:assetId`
  and `DELETE /api/spaces/:id/assets/:assetId` (409 `{usedBy}` scan across the
  space's projects, `?force=1` override, commons entry unshared when the origin
  space deletes). Client pairs the existing (previously uncalled) `deleteAsset`
  op with byte deletion.
- **Code window owns its preview**: 3D scene ↔ Code view toggle at the top of
  the Code window (moved from Share); Share keeps the public entry view.
- **Code ↔ files bridge**: "Project file" picker inserts any library file's
  URL at the cursor; the duplicate space-assets grid is gone.
- **Code file rename** with best-effort `href/src` rewrite in html files.
- **Embed external URL** exposed (previously unreachable `codeSourceType:'url'`).
- **Guidance**: "How content flows →" wiki article (`/wiki#studio-content-model`)
  linked from Create and Code.

## Growth — prioritized

### High value / medium effort
- **Used-by surfaced in the Inspector**: from an entity, jump to its file; from
  a file badge, select the entities using it (reverse lookup exists in
  `libraryItems.usedByCount` — needs the selection hop).
- **Drag & drop from the Files list into the viewport** (drop position = raycast
  hit), replacing the "+ Add places at view center" indirection.
- **Real code editor**: CodeMirror (not Monaco — bundle weight) with syntax
  highlighting and line numbers in the Code window.

### High value / high effort — the PlayCanvas leap
- **Code as behavior**: `components.script` on entities + a sandboxed runtime
  so code affects the 3D scene instead of replacing it. This dissolves the
  last conceptual split (code view vs scene view). Requires schema addition,
  a capability-scoped runtime, and publish-surface support.

### Medium
- Thumbnails for models/video in the Files list (image thumbs exist).
- Files list search + type filter once libraries outgrow one screen.
- Folders/tags at scale; project templates including code + assets.
- Inspector media dropdown listing space files with auto-adopt on select.

### Low / maintenance
- Commons licensing surface (license field exists, barely exposed).
- True storage unification of code files as content-addressed assets (today
  they are document-embedded; fine at current sizes).
- Space-asset delete scan is O(projects-in-space) document reads — index it
  if spaces grow into hundreds of projects.

## Non-goals

- The five-window frame (Create / Scene / World / Share / Code) is fixed —
  growth lands inside windows, never beside them (`docs/ai/golden_rules.md`).
- No new design vocabulary; `scc-*`/`spa-*`/`insp-*` classes only.
