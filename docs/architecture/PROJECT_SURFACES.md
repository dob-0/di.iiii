# Project Surfaces

This repo currently behaves like one platform with multiple editor generations running side by side.

## Surface Map

| Surface | Route | Status | Purpose |
| --- | --- | --- | --- |
| `Public Space View` | `/<space>` and `/main` | Active public surface | Pure viewer when the space has a live published project |
| `V1 Legacy` | `/<space>` and `/main` | Fallback/history lane | Legacy editor fallback when a space does not have a live published project |
| `Admin/Ops` | `/admin?space=<id>` | Active | Operator/debug/status route |
| `Raw` | `/<space>/raw` and `/raw` | Experimental lane (absorbed Beta's role 2026-08-06) | Free-form node nesting (no singletons), universal per-node code panel — see `docs/architecture/RECURSIVE_NODE_CORE.md` |
| `Studio` | `/<space>/studio` and `/studio` | Stable main authoring workspace | Space-scoped project workflow |
| `WCC` | `/wcc` and `/wcc/scene` | Active, linked-space exhibition | Landing page + 3D gallery for the "Women Creating Change" exhibition |
| `serverXR` | `/serverXR` | Required backend | Spaces, projects, assets, ops, SSE, presence |

## Canonical Code Ownership

- `src/App.jsx`
  - V1 legacy editor shell
- `src/SpaceSurfaceApp.jsx`
  - public-space route gate
  - loads the live published project viewer when a space has `publishedProjectId`
  - falls back to the legacy V1 editor otherwise
- `src/components/`
  - shared UI shell, admin/operator surfaces, workspace layout pieces
- `src/hooks/`
  - V1/editor orchestration, sync, panels, and route behavior
- `src/project/`
  - canonical shared project model used by Raw and Studio
  - shared document, schema, sync, presence, and asset behavior should live here
  - includes the public project viewer used by live space routes
- `src/raw/`
  - Raw-specific routes and UI — the sole experimental lane (Beta retired 2026-08-06)
  - experimental workspace attached to a space route
  - project logic here should be treated as wrappers over shared modules, not the long-term home
- `src/studio/`
  - Studio-specific routes and UI
  - stable main authoring surface attached to a space route
- `src/wcc/`
  - the `wcc` linked-space exhibition (landing page + 3D gallery), routed through the same
    server-verified public/private check as any other space
- `shared/`
  - backend/runtime shared schemas
- `src/shared/`
  - frontend shared schemas
- `serverXR/src/`
  - backend runtime

## Document Schema Versioning (accepted gap — audit finding #25, 2026-07-17)

- `shared/projectSchema.cjs` / `src/shared/projectSchema.js` export `PROJECT_DOCUMENT_VERSION` (currently `4`). `normalizeProjectDocument` stamps it onto every document unconditionally on every read/write — it is a **one-way stamp, not a version gate**: the previously-stored `source.version` is never read, compared, or branched on anywhere in either file.
- The only thing standing in for "schema migration" today is defaulting-tolerant normalization: `normalizeEntity`, `normalizeProjectNode`, `normalizeProjectEdge`, `normalizeWorldState`, `normalizeWorkspaceState`, `normalizeRenderSettings`, `normalizeXrState`, `normalizePresentationState`, `normalizePublishState`, `normalizeWindowLayout`, `normalizeAsset`, `normalizeTemplate` (all invoked from `normalizeProjectDocument`) each default a missing/malformed field to a safe value. This is forward-compatible for **additive** changes only (new field ⇒ gets a default when absent on an old document).
- **What's missing:** there is no explicit per-version transform registry. If a future change to the document shape is *breaking* — renaming a field, changing an enum's allowed values, restructuring nested data (e.g. reshaping `worldState`) — nothing detects that a stored document predates the change and nothing transforms it. The normalizer will either silently drop/misread the old field or produce a document that looks normalized but carries stale data. `serverXR/src/db.js`'s `migrations` table (and `serverXR/src/migrate.js`) only cover SQLite table structure and one-time filesystem→DB import — never the JSON document payload inside those tables. The unrelated `document_version` column (`projectStore.js`) is an op-log sequence counter, not a schema version.
- **Why this is accepted debt rather than fixed now:** roughly 8 call sites construct/read project documents through `normalizeProjectDocument` (`serverXR/src/projectStore.js`, `serverXR/src/index.js`, `serverXR/src/routes/projectRoutes.js`, `src/project/state/projectStore.js`, `src/project/import/importLegacyScene.js`, `src/project/transfer/studioProjectBundle.js`, plus the schema files themselves) — any real migration mechanism (versioned transform registry, dispatched by `source.version` before normalization) needs a design pass across all of them, not a local patch, and no breaking document-shape change has actually happened yet to force the issue.
- **Rule going forward:** any change to `projectSchema.js`/`.cjs` that is *breaking* (not just adding a defaulted field) must not ship without first designing an explicit migration path for documents already in the DB — bump `PROJECT_DOCUMENT_VERSION`, add an actual read-time transform keyed off the old value, and add a fixture-based regression test proving an old-shape document round-trips correctly. Don't rely on normalization's defaulting to paper over a breaking change.

## Version And Lane Map

- branch `dev`
  - active development and integration lane
- branch `main`
  - production source
- current package cycle
  - `0.2.0`
- latest tagged release
  - `v0.1.0`

## Project Metadata Sources

These source labels are currently meaningful:

| Source | Meaning |
| --- | --- |
| `project` | neutral/default project metadata |
| `beta-v2` | historical — Beta-created project, from before Beta was retired 2026-08-06; existing tagged projects keep the label as provenance, nothing creates new ones |
| `studio-v3` | Studio-created project |
| `legacy-import` | generic legacy import data before a surface retags it |
| `legacy-import-studio` | Studio import created from a V1 scene |

## Direction

- let `/<space>` act as the public viewer route for the live published project
- let Studio choose which project is live for each space
- keep `V1` stable as the fallback/history editor while Studio owns the main authoring role
- move shared project logic into `src/project/`
- keep route purpose clearer than implementation history
- keep Studio scoped under spaces instead of treating it like a separate product world
- keep `Raw` scoped under spaces the same way

### Beta retired, absorbed into Raw (2026-08-06)

Raw was forked from Beta on 2026-07-19 (see below) with the question of
whether it would absorb Beta, stay permanently parallel, or itself get
superseded left explicitly open. That question is now resolved: Beta and Raw
had diverged into a verbatim fork plus three behaviors (free nesting, an
active-marker mechanism, scope-filtered edges) — a duplicate, not a genuine
alternative — while Beta itself was already effectively unreachable (no
landing link, no route-bundle entry, one dropdown in the legacy V1 spaces
panel). `src/beta/` is deleted; Raw is the one node-first lane. Studio's
read-only graph/world previews (`StudioGraphSurface.jsx`, `StudioWorldSurface.jsx`,
formerly wrapping `BetaGraphSurface`/`BetaViewport`) now wrap Raw's
`RawGraphSurface`/`RawViewport` instead — the only place Studio genuinely
depended on Beta's code rather than just linking to it.

Longer-term: Studio itself is being drawn into the node model rather than
staying a fourth parallel surface — see `feat/raw-studio-node`, which adds a
`studio` container node type (interior = Outliner/Scene/Inspector) that a
user enters like any other node. That does not retire Studio-the-lane yet;
`entities[]` and `nodes[]` remain two separate document models, and
reconciling them is a separate, larger decision.

### On forking a new lane from Beta (Raw, 2026-07-19)

Before this, no lane had ever been forked from another lane — each existing
lane (V1, Beta, Studio) was built independently, and no doc stated a policy
for how an experimental lane graduates, gets superseded, or is retired (the
closest prior mention, an unresolved "define which Beta features graduate
into Studio" bullet, lives only in the archived `PROJECT_AUDIT_2026-04-17.md`
and was never acted on). Raw is the first instance of this pattern: fork the
whole lane, diverge only where the new lane's actual behavior differs (see
`docs/architecture/RECURSIVE_NODE_CORE.md`'s "The `raw` lane" section for
exactly what changed), and let both lanes keep running side by side rather
than committing up front to "Raw replaces Beta." See "Beta retired, absorbed
into Raw" above for how that question was eventually resolved.
