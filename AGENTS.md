# AGENTS

Short routing guide for AI agents working in `di.i`.

## Start Here

- **[PROGRESS.md](PROGRESS.md)** — read this first. Running session log, current workstream status, and easy-win tasks for the next developer. Update it before stopping work.

## Canonical AI Docs

- `AGENTS.md` files are the canonical short routing layer
- `docs/ai/` is the canonical deep-reference layer
- generated bridge files exist for Claude, Gemini, Copilot, and Cursor
- keep shared instructions in `AGENTS.md` and `docs/ai/`, not in tool-native bridge files

## What This Repo Is

- private working repo: `dob-0/di.iiii`
- public mirror repo: `dob-0/di.i`
- main shipped editor: `Studio`
- experimental node-first lane: `Beta`
- compatibility lane: `V1`
- backend authority: `serverXR`

## Default Work Targets

- main product work: `src/studio/`
- shared document/collaboration logic: `src/project/`
- experimental node-first work: `src/beta/`
- schema/runtime contracts: `src/shared/` and `shared/`
- backend/auth/persistence/publish state: `serverXR/`
- automation and release helpers: `scripts/`
- deployment docs/examples: `deploy/`

## Safe Defaults

- prefer `Studio` unless the task is explicitly experimental
- prefer `src/project/` for shared logic
- prefer node-first behavior over growing legacy systems
- treat `worldState`, `windowLayout`, and old entity structures as compatibility bridges
- treat `V1` edits as compatibility work unless the task is explicitly legacy-focused

## Do Not Assume

- `Beta` is not the main shipped product lane
- physical sync and hardware-linked workflows are not fully productized repo capability
- older orchestration files are not always the right place for new canonical logic
- the public repo is not the deploy source of truth

## Validation

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
npm run docs:ai:sync
npm run docs:ai:check
```

## Release Rule

- normal branch flow: `dev -> staging -> main`
- do not start routine feature work on `main`
- use `main` directly only for emergency production hotfixes

## Read Next

- root repo guide: [README.md](README.md)
- AI knowledge base: [docs/ai/index.md](docs/ai/index.md)
- shared project logic: [src/project/AGENTS.md](src/project/AGENTS.md)
- Studio lane: [src/studio/AGENTS.md](src/studio/AGENTS.md)
- shared schema/runtime: [src/shared/AGENTS.md](src/shared/AGENTS.md)
- experimental Beta lane: [src/beta/AGENTS.md](src/beta/AGENTS.md)
- backend contract: [serverXR/README.md](serverXR/README.md)
- backend source guidance: [serverXR/src/AGENTS.md](serverXR/src/AGENTS.md)
- automation scripts: [scripts/AGENTS.md](scripts/AGENTS.md)
- deployment docs: [deploy/AGENTS.md](deploy/AGENTS.md)
- project surfaces: [docs/architecture/PROJECT_SURFACES.md](docs/architecture/PROJECT_SURFACES.md)
- node model direction: [docs/architecture/RECURSIVE_NODE_CORE.md](docs/architecture/RECURSIVE_NODE_CORE.md)
- deploy truth: [docs/deploy/LIVE_DEPLOY.md](docs/deploy/LIVE_DEPLOY.md)

## One-Line Summary

Start with the nearest `AGENTS.md`, use `docs/ai/index.md` for deeper reference, keep shared behavior in shared layers, and treat `serverXR` as authoritative for auth, persistence, publish state, and realtime behavior.
