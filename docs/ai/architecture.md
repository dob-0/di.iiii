# AI Architecture Guide

This page explains how the repo is organized so an agent can route changes quickly.

## Product Lanes

- `Studio`
  - main shipped authoring lane
  - primary place for user-facing product work
- `Beta`
  - experimental recursive node-first lane
  - use for intentional experimentation, not default shipped UX
- `V1`
  - compatibility and migration-sensitive behavior
  - not the default future-facing lane

## Core Data Model

- `space`
  - public and management unit
  - owns routes like `/<space>`, `/<space>/studio`, and `/<space>/beta`
- `project`
  - editable document inside a space
  - stored independently from the public route
- `publishedProjectId`
  - project currently shown on the public route for a space

## Source-of-Truth Layers

- `src/shared/` and `shared/`
  - canonical cross-runtime schema and contract layer
- `src/project/`
  - shared project-document client logic
  - sync, presence, public viewer, imports, shared API access
- `src/studio/`
  - main shipped editor lane UI and routing
- `src/beta/`
  - experimental node-first lane UI and workflows
- `serverXR/src/`
  - backend authority for auth, persistence, assets, publish state, SSE, and realtime presence

## Runtime Flow

Typical project-document flow:

1. schema and defaults come from `src/shared/projectSchema.js`
2. shared client state and sync live in `src/project/`
3. `Studio` and `Beta` consume that shared layer
4. `serverXR/src/` persists documents and ops, serves assets, and broadcasts updates
5. the public route consumes published state through shared viewer logic

## Transitional Truths

- the repo is still between generations
- `Studio` is mainline, but not fully node-native yet
- `Beta` is the strongest node-first surface, but still experimental
- older orchestration files still carry active behavior, but are not always the right long-term home for new canonical logic
- persistence is still single-host filesystem-backed
- writes use session/token-based auth, not a full user/role/audit system yet

## Fast Routing Heuristics

- shared project behavior across lanes: start in `src/project/`
- document shape, defaults, normalization, ops: start in `src/shared/`
- shipped editor UI: start in `src/studio/`
- experimental node-first UX: start in `src/beta/`
- HTTP contract, auth, persistence, realtime, uploads: start in `serverXR/src/`
- automation or deploy flow: start in `scripts/` and `deploy/`
