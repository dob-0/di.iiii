# AGENTS

Short routing guide for AI agents working in `di.iiii`. This file is the lean, always-loaded router.
Full process contract: **[docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)**.

## Start Here

- **[CURRENT.md](CURRENT.md)** — read FIRST, every session. ≤50 lines: last commit, what works, what's broken, and a pointer to the known-fixes table ([docs/ai/known-fixes.md](docs/ai/known-fixes.md)) that prevents re-investigating solved problems.
- **[PROGRESS.md](PROGRESS.md)** — full session history. Read only if CURRENT.md isn't enough. Update before stopping.
- **[MANIFESTO.md](MANIFESTO.md)** — vision and non-negotiables. Read before any architectural/product decision.
- **[docs/ai/golden_rules.md](docs/ai/golden_rules.md)** — hard-won solutions and behavior rules. Add when you learn something worth keeping.

## Role Assignment

Assign one primary owner per task. Read the role card before acting; your scope is locked to its "Owns" list, and "Must Never Touch" files are off-limits (don't read, don't edit).

```text
CSS / layout / visual?              → docs/ai/roles/ui-ux-engineer.md
nodeRegistry / ports / graph model? → docs/ai/roles/node-system-engineer.md
Three.js / viewport / XR render?    → docs/ai/roles/viewport-3d-engineer.md
serverXR / SQLite / auth / API?     → docs/ai/roles/backend-api-engineer.md
shared schema / op-log / CRDT?      → docs/ai/roles/schema-protocol-engineer.md
Docker / GitHub Actions / deploy?   → docs/ai/roles/infrastructure-engineer.md
tests / lint / validation?          → docs/ai/roles/qa-test-engineer.md
auth review / secrets / security?   → docs/ai/roles/security-auditor.md
AGENTS.md / MANIFESTO / arch?       → docs/ai/roles/technical-architect.md
docs / PROGRESS / golden rules?     → docs/ai/roles/documentation-engineer.md
```

Full company guide: [docs/ai/roles/README.md](docs/ai/roles/README.md).

## Model & Token Efficiency — Burn the Minimum

Use the cheapest model that can do the job. Delegate analysis/docs/planning to Ollama first; escalate to Claude only when file edits are needed.

```text
Free (Ollama):  bash scripts/ollama-task.sh fast|deep|coder "..."   (zero API credits)
Haiku  → single-file edits, lint fixes, small tests
Sonnet → feature work, layout bugs, multi-file changes   ← DEFAULT
Opus   → architecture, auth/security, non-negotiables review
```

Full routing guide: [docs/ai/roles/model-routing.md](docs/ai/roles/model-routing.md).

**Startup reads, in order:** `AGENTS.md` (auto) → `CURRENT.md` (full) → nearest scoped `AGENTS.md` → your role card → stop and execute. Read `PROGRESS.md` or anything else only if blocked. Do NOT pre-read golden_rules/architecture/components "just in case".

**Tool budget:** summarize after every 3–5 tool calls. >10 file reads before an edit = scanning too broadly; narrow or ask.

## Operating Rules (compressed — full version in the operating contract)

- Ask at most 2 clarifying questions, then proceed with the safest bounded interpretation. If short/ambiguous and the action is irreversible, ask the smallest question first.
- Lock these before acting: goal, priority, scope, non-goals, output, done criteria.
- Lock scope to declared files/systems; never silently expand it. For a broad request, propose a narrowed scope and wait.
- Highest-priority item first; skip optional extras unless asked.
- Minimum tools for the goal; scoped read/search over broad scans; resolve any tool-output-vs-task conflict before proceeding; confirm expensive/destructive actions first.
- Progress status bar during active work: `status | phase X/Y | XX% | current | next`, one line, updated every 3–5 tool calls (`| blocked: <reason>` if stuck).
- End every task with: **summary** (2–4 lines), **changed files** (one-line reason each), **validation** (commands + pass/fail), **risks** (concrete only).

## Repo Map

- public repo `dob-0/di.iiii` (legacy mirror `dob-0/di.i`, inactive). `serverXR` is authoritative for auth, persistence, publish state, realtime.
- lanes: `Studio` (main shipped editor) · `Beta` (experimental node-first) · `V1` (compatibility).
- work targets: `src/studio/` (main) · `src/project/` (shared doc/collab logic) · `src/beta/` (experimental) · `src/shared/` + `shared/` (schema/runtime contracts) · `serverXR/` (backend) · `scripts/` (automation) · `deploy/` (deploy docs).
- defaults: prefer `Studio` unless explicitly experimental; `src/project/` for shared logic; node-first over growing legacy. Treat `worldState`/`windowLayout`/old entity structures and `V1` edits as compatibility work unless told otherwise.
- do not assume: `Beta` is the shipped lane, physical/hardware sync is productized, old orchestration files are the right home for new logic, or the public repo is the deploy source of truth.

## Validation

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
npm run docs:ai:sync
npm run docs:ai:check
```

## Release & Fork Sync

- Branch flow `dev -> main`. Don't start routine work on `main`; use `main` directly only for emergency hotfixes.
- Fork work lands on a task branch (`feat/…`, `fix/…`, `chore/…`), never the fork's `main`/`dev`. Pushing a task branch triggers `.github/workflows/auto-pr.yml`, which opens/updates a PR to `dob-0/di.iiii`'s `dev`. A push to the fork's `main`/`dev` does NOT notify upstream.
- Upstream (dob-side) agents: review incoming fork PRs against `dev` (`gh pr checkout <n>`, validate, merge to `dev`); promote `dev -> main` only when asked.
- Full contract: [docs/ai/parallel-agents.md](docs/ai/parallel-agents.md).

## Read Next

- [README.md](README.md) · AI knowledge base: [docs/ai/index.md](docs/ai/index.md) · operating contract: [docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)
- scoped guides: [src/project/AGENTS.md](src/project/AGENTS.md) · [src/studio/AGENTS.md](src/studio/AGENTS.md) · [src/shared/AGENTS.md](src/shared/AGENTS.md) · [src/beta/AGENTS.md](src/beta/AGENTS.md) · [serverXR/src/AGENTS.md](serverXR/src/AGENTS.md) · [scripts/AGENTS.md](scripts/AGENTS.md) · [deploy/AGENTS.md](deploy/AGENTS.md)
- backend contract: [serverXR/README.md](serverXR/README.md)
- architecture: [docs/architecture/PROJECT_SURFACES.md](docs/architecture/PROJECT_SURFACES.md) · [docs/architecture/RECURSIVE_NODE_CORE.md](docs/architecture/RECURSIVE_NODE_CORE.md) · deploy truth: [docs/deploy/LIVE_DEPLOY.md](docs/deploy/LIVE_DEPLOY.md)

## One-Line Summary

Start with the nearest `AGENTS.md`, use `docs/ai/index.md` for deeper reference, keep shared behavior in shared layers, and treat `serverXR` as authoritative for auth, persistence, publish state, and realtime behavior.
