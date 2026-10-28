# AGENTS

Routing guide for AI agents in `di.iiii`. Loaded on every session through the root `CLAUDE.md` (`@AGENTS.md`), so it stays short. Full process contract: **[docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)**.

## Start Here

- **Step 0 — [CONTRIBUTING.md](CONTRIBUTING.md)**: two lines of work here, code and space content. Run `npm run start-check` before starting and before pushing. Never commit or push on `dev`/`main` (git hooks refuse it); work on a task branch and push it the day you make it.
- **[CURRENT.md](CURRENT.md)** is printed into the session by the SessionStart hook. Do not read it again.
- **Grep, never read whole:** `PROGRESS.md` (1.6 MB), `docs/ai/known-fixes.md` (0.7 MB), `docs/ai/golden_rules.md` (0.12 MB). Read anything else only when blocked.
- **[MANIFESTO.md](MANIFESTO.md)** before an architectural or product decision. Add to `docs/ai/golden_rules.md` when you learn something worth keeping.

## Roles

One primary owner per task. Open the role card when the task falls in its scope; files under its "Must Never Touch" are off-limits (don't read, don't edit). The Producer hat (`docs/ai/roles/producer.md`) is always on: a new idea arriving mid-task is parked verbatim in `docs/ai/INBOX.md`, not started.

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

## Models and Context

```text
Haiku  → single-file edits, lint fixes, small tests, lookups
Sonnet → feature work, layout bugs, multi-file changes   ← DEFAULT
Opus   → architecture, auth/security, non-negotiables review
```

Routing guide: [docs/ai/roles/model-routing.md](docs/ai/roles/model-routing.md). Every tool round re-reads the whole chat, so cost = rounds × context: batch independent commands into one tool call, cap command output (~40 lines), prefer targeted grep over directory scans. More than 10 file reads before an edit means the search is too broad; narrow or ask.

When compacting, always preserve: the current branch and task, the list of changed files, the last failing command with its output, and every open owner request.

## Operating Rules

Compressed; the full version is the operating contract.

- Ask at most 2 clarifying questions, then proceed with the safest bounded interpretation. Confirm first only for irreversible or expensive actions.
- Lock goal, scope, non-goals and done criteria before acting; never silently expand scope.
- End every task with: **summary** (2–4 lines), **changed files** (one-line reason each), **validation** (commands + pass/fail), **risks** (concrete only).
- Movement: never change Move 1; a new behaviour is a new move (`src/studio/navigation/moves.js`, `docs/ai/decisions/2026-10-14-move-1.md`).
- Shipped a user-facing change? Update the Wiki in the same change: `src/wiki/wikiContent.js` (bump `updated`).
- Fixed a bug? The same change ships a `docs/ai/known-fixes.md` entry AND a regression guard (test or executable contract). The fix alone is not "done".
- Verified it? Not until you looked at it in a real browser, desktop **and** phone (see Validation). A screenshot you never opened is not verification.

## Local Run (aylmo)

- Start a dev server ONLY with `di-dev up <tree>` (`--api scratch` for a throwaway serverXR); `di-dev ls` shows every tree, port and owner; `di-dev doctor` explains a broken one; `di-dev down <tree>` stops it. Never `npm run dev`, `npx vite`, `nohup`, `systemd-run` or `pkill`.
- Addresses are always `diiii.localhost`: own installed di `http://diiii.localhost/<space>/<slug>`, a tree `http://<tree>.diiii.localhost/`, index `http://stacks.diiii.localhost/`. Never a bare port.
- Browser tests run on the agent screen: `di-test-browser up <url>`, `di-test-browser run <script.cjs>`, `di-test-browser shot`. Never a browser, xdotool or Claude-in-Chrome on the owner's display.

## Repo Map

- public repo `dob-0/di.iiii` (legacy mirror `dob-0/di.i`, inactive). `serverXR` is authoritative for auth, persistence, publish state, realtime.
- lanes: `Studio` (main shipped editor) · `Raw` (experimental node-first, free-form node nesting, no singletons — Beta retired 2026-08-06, its role absorbed into Raw) · `V1` (compatibility).
- work targets: `src/studio/` (main) · `src/project/` (shared doc/collab logic) · `src/raw/` (experimental) · `src/timeline/` (timeline/clock/lights/camera vocabulary, shared by the director and the pieces it edits) · `src/shared/` + `shared/` (schema/runtime contracts) · `serverXR/` (backend) · `scripts/` (automation) · `deploy/` (deploy docs).
- **works are not platform.** `src/algoVrithm/` and `src/wccSite/` are artworks, grandfathered, registered in `src/works/works.js` and mounted lazily from `src/works/routes.jsx` — the only two platform files allowed to name one. Never import from inside a work anywhere else (`src/works/boundary.test.js` fails the build), and never add a third: a new work gets its own repo and arrives as a space, like `br_id_ge` and `beyond_form`. See `docs/ai/golden_rules.md` → "Platform and works".
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
npm run verify:surfaces -- --base https://dev.diiii.xyz          # desktop + 5 devices
npm run verify:surfaces:mobile -- --base https://diiii.xyz    # phones/tablet only
```

Then **open the screenshots** in `.verify-surfaces/`. 43 of the 134 defects in
known-fixes are silent failures and 29 are mobile-only — none of them fail a
unit test. Full standard, and the techniques that do NOT work here:
**[docs/ai/verification-charter.md](docs/ai/verification-charter.md)**.

## Release & Fork Sync

- Three tiers: local · dev · prod. `dev` branch → the dev tier, dev.diiii.xyz (rehearsal) · `main` branch → prod, diiii.xyz (live). The tier and the branch share the name `dev`; say "the dev tier" when you mean the server. Identifiers say `dev` too (`deploy-vps-dev.yml`, `docker-compose.dev.yml`, `DEV_*`) — see [docs/ai/vocabulary.md](docs/ai/vocabulary.md).
- Branch flow `dev -> main`, promote only after the dev tier is verified. Don't start routine work on `main`; use `main` directly only for emergency hotfixes.
- Fork work lands on a task branch (`feat/…`, `fix/…`, `chore/…`), never the fork's `main`/`dev`. Pushing a task branch triggers `.github/workflows/auto-pr.yml`, which opens/updates a PR to `dob-0/di.iiii`'s `dev`. A push to the fork's `main`/`dev` does NOT notify upstream. A fresh fork must enable Actions once (GitHub disables fork workflows by default) and set an `UPSTREAM_PR_TOKEN` secret before auto-PR can run.
- Upstream (dob-side) agents: review incoming fork PRs against `dev` (`gh pr checkout <n>`, validate, merge to `dev`); promote `dev -> main` only when asked.
- Full contract: [docs/ai/parallel-agents.md](docs/ai/parallel-agents.md).

## Read Next

- [README.md](README.md) · AI knowledge base: [docs/ai/index.md](docs/ai/index.md) · operating contract: [docs/ai/agent-operating-contract.md](docs/ai/agent-operating-contract.md)
- scoped guides: [src/project/AGENTS.md](src/project/AGENTS.md) · [src/studio/AGENTS.md](src/studio/AGENTS.md) · [src/shared/AGENTS.md](src/shared/AGENTS.md) · [src/raw/AGENTS.md](src/raw/AGENTS.md) · [serverXR/src/AGENTS.md](serverXR/src/AGENTS.md) · [scripts/AGENTS.md](scripts/AGENTS.md) · [deploy/AGENTS.md](deploy/AGENTS.md)
- backend contract: [serverXR/README.md](serverXR/README.md)
- architecture: [docs/architecture/PROJECT_SURFACES.md](docs/architecture/PROJECT_SURFACES.md) · [docs/architecture/RECURSIVE_NODE_CORE.md](docs/architecture/RECURSIVE_NODE_CORE.md) · deploy truth: [docs/deploy/LIVE_DEPLOY.md](docs/deploy/LIVE_DEPLOY.md)

## One-Line Summary

Start with the nearest `AGENTS.md`, use `docs/ai/index.md` for deeper reference, keep shared behavior in shared layers, and treat `serverXR` as authoritative for auth, persistence, publish state, and realtime behavior.
