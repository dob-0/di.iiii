# Project Surfaces

This repo currently behaves like one platform with multiple editor generations running side by side.

## Surface Map

| Surface | Route | Status | Purpose |
| --- | --- | --- | --- |
| `Public Space View` | `/<space>` and `/main` | Active public surface | Pure viewer when the space has a live published project |
| `V1 Legacy` | `/<space>` and `/main` | Stable compatibility lane | Legacy editor fallback when a space does not have a live published project |
| `Admin/Ops` | `/admin?space=<id>` | Active | Operator/debug/status route |
| `V2 Beta` | `/<space>/beta` and `/beta` | Beta lane | Older project-based desktop workflow kept as the beta editor |
| `Studio` | `/<space>/studio` and `/studio` | Main authoring workspace | Space-scoped project workflow |
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
  - canonical shared project model used by Beta and Studio
  - includes the public project viewer used by live space routes
- `src/beta/`
  - Beta-specific routes and UI
  - beta workspace attached to a space route
  - project logic here should be treated as compatibility wrappers, not the long-term home
- `src/studio/`
  - Studio-specific routes and UI
  - main authoring surface attached to a space route
- `shared/`
  - backend/runtime shared schemas
- `src/shared/`
  - frontend shared schemas
- `serverXR/src/`
  - backend runtime

## Version And Lane Map

- branch `dev`
  - work lane
  - staging source
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
| `beta-v2` | Beta-created or Beta-owned project |
| `studio-v3` | Studio-created project |
| `legacy-import` | generic legacy import data before a surface retags it |
| `legacy-import-studio` | Studio import created from a V1 scene |

## Direction

- let `/<space>` act as the public viewer route for the live published project
- let Studio choose which project is live for each space
- keep `V1` stable as the fallback editor while Studio owns the main authoring role
- keep `Beta` available as the beta lane
- move shared project logic into `src/project/`
- keep route purpose clearer than implementation history
- keep Beta scoped under spaces instead of treating it like a separate product world
- keep Studio scoped under spaces instead of treating it like a separate product world
