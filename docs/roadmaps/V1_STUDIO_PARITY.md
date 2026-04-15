# V1 To Studio Parity

This checklist is the working transition guide for the Studio-first plan.

Status legend:

- `Done` = already present in Studio
- `In Progress` = present, partial, or still rough
- `Later` = not a near-term blocker yet

## Core Workflow

| Capability | V1 | Studio | Status | Notes |
| --- | --- | --- | --- | --- |
| Open editor from route | Yes | Yes | Done | `/<space>` for V1, `/<space>/studio` for Studio, with `/studio` as a `main` compatibility alias |
| Create project/document | n/a | Yes | Done | Studio hub can create and reopen projects |
| Import legacy scene file | Local scene oriented | Yes | Done | Studio can import legacy scene files into project documents |
| Stable public default route | Yes | Partial | In Progress | `/<space>` now opens a pure viewer when the space has a live published project, and falls back to V1 otherwise |

## Scene And Entity Authoring

| Capability | V1 | Studio | Status | Notes |
| --- | --- | --- | --- | --- |
| Primitive creation | Yes | Yes | Done | Shared entity registry now lives in `src/project/` |
| Media entities | Yes | Yes | Done | Images, video, audio, and model flows exist |
| Inspector editing | Yes | Yes | In Progress | Studio has a cleaner inspector but still needs more depth and polish |
| Camera save/default view | Yes | Yes | In Progress | Present in Studio, still worth UX cleanup |
| 2D / fixed-camera polish | Partial | Partial | In Progress | Still a stated focus area in the repo |

## Collaboration

| Capability | V1 | Studio | Status | Notes |
| --- | --- | --- | --- | --- |
| Durable ops model | Yes | Yes | Done | V1 uses scene ops; Studio uses project ops |
| SSE catch-up | Yes | Yes | Done | Shared contract pattern |
| Presence and cursors | Yes | Yes | Done | Socket.IO-backed |
| Clear source metadata | n/a | Yes | Done | Studio project creation now preserves `source: studio-v3` |

## Publishing And Ops

| Capability | V1 | Studio | Status | Notes |
| --- | --- | --- | --- | --- |
| Admin/operator route | Yes | Indirect | In Progress | Admin is still rooted in the V1/operator side |
| Export project document | n/a | Yes | Done | Studio can export `.studio.json` |
| Choose live project for a space | n/a | Yes | Done | Studio publish controls can set or clear the live published project used by `/<space>` |
| Production-default editor | Yes | Not yet | Later | Switch only after stronger parity and confidence |

## Next Moves

1. Keep V1 reliable and boring.
2. Keep Studio as the main authoring workspace for each space.
3. Keep migrating shared project logic out of beta-branded locations.
4. Close UX gaps around camera, settings, and operator flow.
5. Keep improving the pure public viewer so it can fully replace legacy public-facing V1 usage over time.
