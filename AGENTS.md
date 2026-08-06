# AGENTS

Short routing guide for AI agents working in `di.iiii`. This file is the lean, always-loaded router.
Full process contract: **[docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)**.

## Start Here

- **[CURRENT.md](CURRENT.md)** — read FIRST, every session. ≤50 lines: what works, what's broken, open calls, and a pointer to the known-fixes table ([docs/ai/known-fixes.md](docs/ai/known-fixes.md)) that prevents re-investigating solved problems. No commit SHAs or branch positions — those are derived; run `npm run state`.
- **[PROGRESS.md](PROGRESS.md)** — full session history. Read only if CURRENT.md isn't enough. Update before stopping.
- **[MANIFESTO.md](MANIFESTO.md)** — vision and non-negotiables. Read before any architectural/product decision.
- **[docs/ai/golden_rules.md](docs/ai/golden_rules.md)** — hard-won solutions and behavior rules. Add when you learn something worth keeping.

## Role Assignment

Assign one primary owner per task. Read the role card before acting; your scope is locked to its "Owns" list, and "Must Never Touch" files are off-limits (don't read, don't edit).

**Default first hat, always on:** the Producer (`docs/ai/roles/producer.md`) — classify every incoming user message (steering the current task vs. a new impulsive idea), park new ideas verbatim + translated in `docs/ai/INBOX.md`, never mix them into running work, review the inbox at session end.

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
XR experience / spatial UX / presence / exhibition design? → docs/ai/roles/xr-creator.md
```

Full company guide: [docs/ai/roles/README.md](docs/ai/roles/README.md).

## Model & Token Efficiency — Burn the Minimum

Use the cheapest model that can do the job.

```text
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
- Shipped a user-facing feature or behavior change? Update the Wiki in the same change — add/edit the entry in `src/wiki/wikiContent.js` (bump `updated`; add to `WIKI_HIGHLIGHTS` if headline-worthy). Part of "done," same tier as CURRENT.md. See `docs/ai/golden_rules.md`.
- Fixed a bug? The same change ships a `docs/ai/known-fixes.md` entry AND a regression guard (test or executable contract) — each bug class is paid for once. The fix alone is not "done".
- Verified it? Not until you looked at it — real browser, desktop **and** phone. See the Validation section; `npm run verify:surfaces`. A regression guard you never saw fail is decoration, and a screenshot you never opened is not verification.

## Repo Map

- public repo `dob-0/di.iiii` (legacy mirror `dob-0/di.i`, inactive). `serverXR` is authoritative for auth, persistence, publish state, realtime.
- lanes: `Studio` (main shipped editor) · `Raw` (experimental node-first, free-form node nesting, no singletons — Beta retired 2026-08-06, its role absorbed into Raw) · `V1` (compatibility).
- work targets: `src/studio/` (main) · `src/project/` (shared doc/collab logic) · `src/raw/` (experimental) · `src/shared/` + `shared/` (schema/runtime contracts) · `serverXR/` (backend) · `scripts/` (automation) · `deploy/` (deploy docs).
- defaults: prefer `Studio` unless explicitly experimental; `src/project/` for shared logic; node-first over growing legacy. Treat `worldState`/`windowLayout`/old entity structures and `V1` edits as compatibility work unless told otherwise.
- do not assume: `Raw` is the shipped lane, physical/hardware sync is productized, old orchestration files are the right home for new logic, or that the public repo is the deploy source of truth.

## Validation

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
npm run docs:ai:sync
npm run docs:ai:check
```

**A green run is not evidence that the product works.** Anything that can change
what a person sees or does must also be verified in a real browser, on desktop
AND on a phone, by looking at it:

```bash
npm run verify:surfaces -- --base https://staging.di-studio.xyz   # desktop + 5 devices
npm run verify:surfaces:mobile -- --base https://di-studio.xyz    # phones/tablet only
```

Then **open the screenshots** in `.verify-surfaces/`. 43 of the 134 defects in
known-fixes are silent failures and 29 are mobile-only — none of them fail a
unit test. Full standard, and the techniques that do NOT work here:
**[docs/ai/verification-charter.md](docs/ai/verification-charter.md)**.

## Release & Fork Sync

- Two lanes, four names: `dev` branch → staging.di-studio.xyz (rehearsal) · `main` branch → di-studio.xyz (live). Staging/prod are deploy targets, not branches.
- Branch flow `dev -> main`, promote only after staging verify. Don't start routine work on `main`; use `main` directly only for emergency hotfixes.
- Fork work lands on a task branch (`feat/…`, `fix/…`, `chore/…`), never the fork's `main`/`dev`. Pushing a task branch triggers `.github/workflows/auto-pr.yml`, which opens/updates a PR to `dob-0/di.iiii`'s `dev`. A push to the fork's `main`/`dev` does NOT notify upstream.
- Upstream (dob-side) agents: review incoming fork PRs against `dev` (`gh pr checkout <n>`, validate, merge to `dev`); promote `dev -> main` only when asked.
- Full contract: [docs/ai/parallel-agents.md](docs/ai/parallel-agents.md).

## Read Next

- [README.md](README.md) · AI knowledge base: [docs/ai/index.md](docs/ai/index.md) · operating contract: [docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)
- scoped guides: [src/project/AGENTS.md](src/project/AGENTS.md) · [src/studio/AGENTS.md](src/studio/AGENTS.md) · [src/shared/AGENTS.md](src/shared/AGENTS.md) · [src/raw/AGENTS.md](src/raw/AGENTS.md) · [serverXR/src/AGENTS.md](serverXR/src/AGENTS.md) · [scripts/AGENTS.md](scripts/AGENTS.md) · [deploy/AGENTS.md](deploy/AGENTS.md)
- backend contract: [serverXR/README.md](serverXR/README.md)
- architecture: [docs/architecture/PROJECT_SURFACES.md](docs/architecture/PROJECT_SURFACES.md) · [docs/architecture/RECURSIVE_NODE_CORE.md](docs/architecture/RECURSIVE_NODE_CORE.md) · deploy truth: [docs/deploy/LIVE_DEPLOY.md](docs/deploy/LIVE_DEPLOY.md)

## One-Line Summary

Start with the nearest `AGENTS.md`, use `docs/ai/index.md` for deeper reference, keep shared behavior in shared layers, and treat `serverXR` as authoritative for auth, persistence, publish state, and realtime behavior.
