# AGENTS

Short routing guide for AI agents working in `di.iiii`.

## Start Here

- **[CURRENT.md](CURRENT.md)** — read this FIRST, every session, no exceptions. ≤50 lines. Last commit, what works, what's broken, and a known-fixes table that prevents re-investigating already-solved problems. Update the known-fixes table whenever you solve something that took > 5 minutes.
- **[PROGRESS.md](PROGRESS.md)** — full session history. Read only if you need context beyond what CURRENT.md covers. Update it before stopping work.
- **[MANIFESTO.md](MANIFESTO.md)** — platform vision and non-negotiables. Read before any architectural or product decision.
- **[docs/ai/golden_rules.md](docs/ai/golden_rules.md)** — living record of hard-won solutions and agent behavior rules. Add to it when you discover something worth keeping.

## AI Company — Role Assignment

Before starting any task, assign a role. Every task has exactly one primary owner.

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

Full company guide: **[docs/ai/roles/README.md](docs/ai/roles/README.md)**

Read your role card before acting. Your scope is locked to what the card's "Owns" section lists. Files under "Must Never Touch" are off-limits — do not read, do not edit them.

## Token Efficiency — Burn the Minimum

**Model selection:** Use the cheapest model that can do the job correctly.

```text
Free (Ollama local):
  bash scripts/ollama-task.sh fast  "..."   → dob-fast  (project-fine-tuned, Q&A, docs)
  bash scripts/ollama-task.sh deep  "..."   → dob-deep  (project-fine-tuned, deep analysis)
  bash scripts/ollama-task.sh coder "..."   → qwen3-coder:30b (test design, logic)

Paid (Claude API):
  Haiku   → single-file edits, lint fixes, small test additions
  Sonnet  → feature work, layout bugs, multi-file changes  ← DEFAULT
  Opus    → architecture decisions, auth/security, non-negotiables review
```

Full routing guide: [docs/ai/roles/model-routing.md](docs/ai/roles/model-routing.md)

**Startup: read only what you need.**

1. `AGENTS.md` — auto-loaded, always
2. `CURRENT.md` — always, read in full (≤50 lines, takes 30 seconds, prevents re-doing solved work)
3. Nearest scoped `AGENTS.md` for the area you will edit
4. Your role card
5. Stop. Execute. Read more only if blocked.
6. `PROGRESS.md` — only if you need full session history beyond what CURRENT.md covers

Do NOT pre-read golden_rules, architecture.md, every component "just in case".

**Tool budget per task:** stop and summarize after every 5 tool calls. If you exceed 10 file reads before making an edit, you are scanning too broadly — narrow the scope or ask.

**Delegate to Ollama first** for any task that is analysis, documentation, or planning. Only escalate to Claude when file edits are required.

## Universal Startup Contract (All Models)

This contract applies to all agent entrypoints in this repo (Claude, Gemini, Copilot, Cursor, and AGENTS-native readers).

At project open:

- read root `AGENTS.md` first
- read `CURRENT.md` immediately after — it has the known-fixes table and prevents re-doing solved work
- read the nearest scoped `AGENTS.md` before edits
- use `docs/ai/index.md` only for deeper reference

During active work:

- follow Default Task Mode and AI Task Contract below
- emit the required progress status bar updates
- keep responses scoped, concise, and validation-backed

## Default Task Mode

Apply this by default unless the user says otherwise:

- ask at most 2 clarifying questions
- if the prompt or command is short, ambiguous, or under-specified, pause, think, and ask the smallest clarifying question before editing files or taking irreversible action
- lock scope to declared files/systems
- do the highest-priority item first
- avoid optional extras unless requested
- end with: summary, changed files, validation, unresolved risks

Progress status bar (required during active work):

- format: `status | phase X/Y | XX% | current | next`
- update every 3 to 5 tool calls or after each meaningful edit batch
- keep each update to one line unless a blocker appears
- if blocked: append `| blocked: <reason>` and request the smallest missing input

## Canonical AI Docs

- `AGENTS.md` files are the canonical short routing layer
- `docs/ai/` is the canonical deep-reference layer
- generated bridge files exist for Claude, Gemini, Copilot, and Cursor
- keep shared instructions in `AGENTS.md` and `docs/ai/`, not in tool-native bridge files

## What This Repo Is

- primary public repo: `dob-0/di.iiii`
- legacy mirror repo: `dob-0/di.i` (currently hidden/inactive)
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

## AI Task Contract (Required)

Before acting on a task, lock these fields in order:

- goal: one exact outcome
- priority: ordered list, highest first
- scope: allowed files and systems
- non-goals: what must not be changed
- output: expected format and length
- done criteria: objective checks

If any field is missing and the task can cause broad or destructive edits, ask for clarification before changing files.

Strict execution rules:

- ask at most 2 clarifying questions, then proceed with the safest bounded interpretation
- do not silently expand scope beyond declared files/systems
- if requested scope is broad, propose a narrowed scope first and wait for confirmation
- report only task-relevant findings; defer optional ideas unless asked
- always end with: changed files, validations run, unresolved risks

## MCP / Tool-Usage Guardrails

- use the minimum number of tools needed to satisfy the goal
- avoid broad scans when a scoped file read/search is enough
- avoid edits outside declared scope
- after every 3 to 5 tool calls, summarize what was learned and what is next
- if tool output conflicts with the task request, stop and resolve the conflict before proceeding
- if a tool action is expensive or potentially destructive, confirm intent first

Response format contract:

- summary: 2 to 4 lines max
- changes: file list with one-line reason each
- validation: exact commands and pass/fail
- risks: only concrete unresolved items

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

- normal branch flow: `dev -> main`
- do not start routine feature work on `main`
- use `main` directly only for emergency production hotfixes

## Fork → Upstream Auto-Sync (how work reaches `dob-0/di.iiii`)

- Fork-side work must land on a **task branch** (`feat/…`, `fix/…`, `chore/…`), never on the fork's `main` or `dev`.
- Pushing that branch triggers `.github/workflows/auto-pr.yml`, which auto-opens/updates a PR against `dob-0/di.iiii`'s `dev`. **A push to the fork's `main`/`dev` does NOT notify upstream** — the work is invisible to dob until it rides a task-branch PR.
- **Upstream (dob-side) agents:** incoming fork PRs target `dev`. Review with `gh pr checkout <n>`, validate (lint/build/test), then merge into `dev`; promote `dev -> main` only when explicitly asked. Merging keeps every fork in sync on its next `git fetch upstream && git merge --ff-only upstream/dev`.
- Full contract and the parallel-work modes: [docs/ai/parallel-agents.md](docs/ai/parallel-agents.md).

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
