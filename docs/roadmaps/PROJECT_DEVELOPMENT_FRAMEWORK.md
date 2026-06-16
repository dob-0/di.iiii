# Project Development And Optimization Framework

This doc is the working framework for deciding what to build next, what to optimize next, and how to keep the repo moving toward a cleaner long-term shape without losing the shipped product.

Use it alongside:

- [../architecture/PROJECT_AUDIT_2026-04-17.md](../architecture/PROJECT_AUDIT_2026-04-17.md)
- [../architecture/PROJECT_SURFACES.md](../architecture/PROJECT_SURFACES.md)
- [../../AGENTS.md](../../AGENTS.md)

## North Star

Keep the project pointed at this shape:

- `Studio` is the main shipped authoring product
- `Beta` is the experiment lane
- `V1` is compatibility and fallback, not the default place for new product investment
- `src/project/` is the shared project/document center
- `serverXR` is authoritative for auth, persistence, publish state, realtime catch-up, and presence contracts
- `dev -> staging -> main` is the normal release path

## Framework Goals

Use this framework to keep work balanced across five goals:

1. ship visible product improvements in `Studio`
2. move shared logic into the right shared layers instead of multiplying lane-specific code
3. reduce operational and security risk in `serverXR`
4. make the public viewer and editor surfaces lighter, faster, and easier to reason about
5. keep deploy, docs, and validation boring and repeatable

## Default Workstreams

### 1. Product And UX

Use this lane for authoring improvements that users feel directly.

- keep `Studio` as the main surface for new product work
- treat `Beta` as the proving ground for ideas that are intentionally experimental
- use `V1` only for compatibility, fallback, and migration-sensitive fixes

### 2. Shared Document Architecture

Use this lane when the change should benefit more than one surface.

- prefer `src/project/` for shared sync, presence, viewer, import, and document-state behavior
- prefer `src/shared/` and `shared/` for schema and runtime contract truth
- avoid duplicating durable logic in `src/studio/` and `src/beta/`

### 3. Platform And Trust Boundary

Use this lane for security, persistence, and authority boundaries.

- keep `serverXR` as the source of truth for writes, publish state, and durable sync
- treat the current shared-token model as transitional
- push toward real identity, roles, signed actions, and auditability before broadening team or public editing

### 4. Performance And Bundle Weight

Use this lane for work that improves speed, load time, responsiveness, and codebase maneuverability.

- keep the public viewer path as lean as possible
- favor route-level lazy loading for heavy editor-only surfaces
- split oversized orchestration files by domain responsibility, not arbitrary line count
- add measurement before and after optimization work whenever possible

### 5. Ops, Docs, And Release Confidence

Use this lane for work that keeps the project easy to run and safe to promote.

- preserve the `dev -> staging -> main` promotion path
- keep deploy automation simple and well documented
- update docs when repo truth changes
- keep validation commands green and easy to trust

## Intake Questions Before Starting Work

Ask these questions before picking an implementation path:

1. Is this mainly `Studio`, shared project logic, `Beta`, `V1`, or backend authority work?
2. If both `Studio` and `Beta` should benefit, can this move into `src/project/` instead?
3. Does this change document shape, defaults, normalization, or ops behavior in `src/shared/` or `shared/`?
4. Does this cross the network boundary and need backend contract coverage?
5. Does this increase bundle weight, route complexity, or file concentration in a known hotspot?
6. Does this remove a bridge, or create another bridge we will need to unwind later?

## Development Loop

Use this loop for feature work and optimization work.

1. Name the target outcome in one sentence.
2. Pick the owning surface or shared layer before touching code.
3. Define the success signal: feature behavior, test coverage, bundle change, latency improvement, file split, or deploy confidence.
4. Implement the smallest slice that moves the system forward.
5. Validate locally with the right command set.
6. Promote through `staging` before `main` when the work affects deploy, auth, persistence, publish state, or shared editor behavior.
7. Record a checkpoint when the work changes project truth, workflow, or architecture direction.

## Optimization Scorecard

Use this scorecard to decide whether the repo is getting healthier.

| Area | Healthy Signal | Warning Signal |
| --- | --- | --- |
| Product focus | `Studio` gets the main investment | product work keeps spreading across `Studio`, `Beta`, and `V1` equally |
| Shared architecture | more durable logic lives in `src/project/` and `src/shared/` | lane-specific wrappers grow into separate systems |
| Security boundary | fewer browser-held write secrets, stronger server sessions, clearer roles | shared write tokens remain the long-term model |
| Performance | public viewer stays lean and heavy editor surfaces load on demand | public routes pay for editor-only code by default |
| Codebase maneuverability | largest orchestration files shrink by responsibility | root shells and control panels keep absorbing more concerns |
| Release confidence | lint, build, tests, and staging checks stay routine | deploy success depends on tribal memory or manual recovery |

## Current Recommended Priority Order

This order matches the repo audit and gives the best leverage.

1. strengthen auth and role boundaries in `serverXR`
2. decompose the biggest frontend orchestration files by domain
3. reduce public bundle weight and add route-level lazy loading where it matters
4. keep cleaning route ownership and operator/admin boundaries
5. move persistence toward a database plus object storage model when the current filesystem approach starts blocking growth

## Recommended Next Milestone

If the goal is to improve development speed and optimization leverage right now, start with a foundation pass that combines architecture cleanup and performance wins:

1. split `src/App.jsx` and `src/components/PreferencesPage.jsx` by domain responsibility
2. add route-level lazy loading for `Studio`, `Beta`, and heavy operator-only surfaces
3. keep shared project behavior moving into `src/project/` instead of editor-specific shells
4. define the next auth hardening slice in `serverXR` so security work advances in parallel with frontend cleanup

## Hotspots To Watch

These are known pressure points where work should stay intentional:

- `src/App.jsx`
- `src/components/PreferencesPage.jsx`
- `src/studio/components/StudioShell.jsx`
- `src/hooks/useAssetPipeline.js`
- `serverXR/src/index.js`
- `serverXR/src/routes/spaceRoutes.js`

When work touches these files, prefer extraction by concern over adding another large conditional branch.

## Definition Of Done

Work is not really done until these are true:

- the owning layer is clear and the change landed in the right place
- shared behavior was not duplicated into multiple editor lanes without a deliberate reason
- relevant tests or validation commands were run
- docs were updated if product, workflow, or architecture truth changed
- staging verification happened for deploy-sensitive or backend-authority changes
- the change makes the system either more capable, simpler, or safer

## Standard Validation Set

Use the full set when the work is broad or cross-cutting:

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
```

Use these when canonical AI docs changed:

```bash
npm run docs:ai:sync
npm run docs:ai:check
```

## Working Cadence

Use this cadence to keep momentum without losing coherence:

- per task: choose the owning layer first
- per merge-sized change: run the smallest useful validation set
- per milestone: write or refresh a dated checkpoint in `docs/checkpoints/`
- per planning pass: compare the next proposed work against the scorecard and priority order in this doc

## One-Line Rule

Build the next useful thing in `Studio`, move shared truth into shared layers, harden `serverXR`, and only optimize where the measurement or maintenance pressure is real.
