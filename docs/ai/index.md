# AI Docs Index

This is the deep-reference layer for AI agents working in `di.iiii`.

Use this directory for durable, structured context that is too large or too detailed for startup instruction files.

## Canonical System

- short routing docs live in `AGENTS.md` files
- deeper reference docs live in `docs/ai/`
- generated bridge files for Claude, Gemini, Copilot, and Cursor are derived from the canonical docs
- keep tool-specific files thin and generated

## Start Here

Read in this order:

1. [../../AGENTS.md](../../AGENTS.md)
2. the nearest scoped `AGENTS.md` for the area you are editing
3. the relevant deep-reference page in this folder

## AI Engineering Company — Role Cards

Every task has an owner. Route to the right role before starting work.

- [roles/README.md](roles/README.md) — company overview, org chart, routing guide
- [roles/ui-ux-engineer.md](roles/ui-ux-engineer.md) — CSS, layout, visual identity, React render
- [roles/node-system-engineer.md](roles/node-system-engineer.md) — nodeRegistry, ports, graph model, runtime
- [roles/viewport-3d-engineer.md](roles/viewport-3d-engineer.md) — Three.js, BetaViewport, XR rendering
- [roles/backend-api-engineer.md](roles/backend-api-engineer.md) — serverXR, SQLite, auth, API routes
- [roles/schema-protocol-engineer.md](roles/schema-protocol-engineer.md) — shared/, op-log, CRDT rules
- [roles/infrastructure-engineer.md](roles/infrastructure-engineer.md) — Docker, GitHub Actions, deploy
- [roles/qa-test-engineer.md](roles/qa-test-engineer.md) — tests, lint, validation
- [roles/security-auditor.md](roles/security-auditor.md) — auth patterns, secrets, non-negotiables
- [roles/technical-architect.md](roles/technical-architect.md) — cross-cutting decisions, MANIFESTO.md
- [roles/documentation-engineer.md](roles/documentation-engineer.md) — docs/, PROGRESS.md, golden rules

## Deep Reference Pages

- [golden_rules.md](golden_rules.md) — hard-won solutions + agent behavior rules (read this early)
- [elite-debug.md](elite-debug.md) — investigation epistemology: how to think when debugging, DRY at architecture level, model-first investigation
- [design-baseline.md](design-baseline.md) — locked default visual style (landing page: colors, typography, cyan grid scene) for new public surfaces
- [parallel-agents.md](parallel-agents.md) — running more than one agent on this repo at once
- [architecture.md](architecture.md)
- [workflows.md](workflows.md)
- [testing.md](testing.md)
- [deploy.md](deploy.md)
- [agent-support-matrix.md](agent-support-matrix.md)
- [private-overrides.md](private-overrides.md)
- [v1-studio-feature-map.md](v1-studio-feature-map.md) — full V1 vs Studio feature audit; what to port, what to skip, schema notes for grouping/linking/expressions

## Scoped Guides

Use the nearest scoped guide before reading broad docs:

- root repo: [../../AGENTS.md](../../AGENTS.md)
- shared project logic: [../../src/project/AGENTS.md](../../src/project/AGENTS.md)
- main shipped Studio lane: [../../src/studio/AGENTS.md](../../src/studio/AGENTS.md)
- shared schema/runtime: [../../src/shared/AGENTS.md](../../src/shared/AGENTS.md)
- experimental Beta lane: [../../src/beta/AGENTS.md](../../src/beta/AGENTS.md)
- backend source: [../../serverXR/src/AGENTS.md](../../serverXR/src/AGENTS.md)
- automation scripts: [../../scripts/AGENTS.md](../../scripts/AGENTS.md)
- deployment docs/examples: [../../deploy/AGENTS.md](../../deploy/AGENTS.md)

## Maintenance Commands

```bash
npm run docs:ai:sync
npm run docs:ai:check
```

Use `sync` after changing canonical AI docs. Use `check` before finishing AI-doc work or when CI reports drift.

## Design Rule

Treat root docs as the table of contents, not the encyclopedia. Prefer progressive disclosure:

- small stable entrypoint first
- scoped instructions second
- deep reference only when needed
