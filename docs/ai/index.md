# AI Docs Index

This is the deep-reference layer for AI agents working in `di.i`.

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

## Deep Reference Pages

- [architecture.md](architecture.md)
- [workflows.md](workflows.md)
- [testing.md](testing.md)
- [deploy.md](deploy.md)
- [agent-support-matrix.md](agent-support-matrix.md)
- [private-overrides.md](private-overrides.md)

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
