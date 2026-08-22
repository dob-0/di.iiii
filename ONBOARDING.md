# Onboarding — di.iiii

Welcome. This is the **one-stop setup** so a new person can clone the project,
run it locally, and start contributing the same way the rest of the team does.
Follow it top to bottom. Tested on Windows 11 + Node 24; notes for macOS/Linux
inline.

> **Wrong door?** If you were invited to *collaborate on a space* — build scenes,
> upload work, edit projects — you need none of this. That path is a browser tab
> and nothing else: [di-studio.xyz/wiki#joining-a-space](https://di-studio.xyz/wiki#joining-a-space).
> This page is for running and changing the platform itself.

> TL;DR for the impatient: install prerequisites → fork & clone → `npm install`
> (root **and** `serverXR`) → create `serverXR/.env` → `npm run dev` → open
> `http://localhost:5173/main`. Using Claude Code? Don't skip §8 — the project
> ships its own AI workflow; you only log in and trust it.

---

## 1. Install prerequisites (once per machine)

| Tool | Why | Windows (winget) | macOS (brew) |
| --- | --- | --- | --- |
| **Git** | clone / commit / push | `winget install Git.Git` | `brew install git` |
| **Node 22.x** (24 also works) | runs client + server | `winget install OpenJS.NodeJS.LTS` | `brew install node` |
| **GitHub CLI (`gh`)** | auth, open PRs, sync with upstream | `winget install GitHub.cli` | `brew install gh` |

Verify:

```bash
git --version
node -v
npm -v
gh --version
```

> On Windows, `gh` may not be on PATH in a fresh shell right after install.
> Full path: `C:\Program Files\GitHub CLI\gh.exe` (or reopen the terminal).

## 2. Log in to GitHub CLI (once)

```bash
gh auth login
```

Choose **GitHub.com → HTTPS → Login with a web browser**, then enter the
one-time code shown. This also lets `git push` work without re-entering a token.

## 3. Get the code

We use a fork-based flow. Fork `dob-0/di.iiii` on GitHub first (button on the
repo page), then:

```bash
git clone https://github.com/<your-username>/di.iiii.git
cd di.iiii
git remote add upstream https://github.com/dob-0/di.iiii.git   # to pull updates later
```

## 4. Install dependencies (root AND serverXR)

There are **two** package trees — install both:

```bash
npm install
npm --prefix serverXR install
```

> Node 24 prints an `EBADENGINE` warning (engines ask for 22.x). It's only a
> warning; the app runs. To silence it: `npm install --engine-strict=false`.

## 5. Create the local server env

`serverXR` needs a local `.env` (and `.env.local`) — both are **gitignored**, so
they never get pushed. The dev server watches both files and won't start if they
don't exist.

Copy the example and relax auth for local browsing:

```bash
cp serverXR/.env.example serverXR/.env
# then create an empty local override:
#   Windows: New-Item serverXR/.env.local -ItemType File
#   mac/linux: touch serverXR/.env.local
```

In `serverXR/.env`, for local use set:

```
REQUIRE_AUTH=true
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`REQUIRE_AUTH=true` is the honest setting, and it is what the boxes doing real
work run. With it **off**, every scope check is skipped and every space is
visible to everyone — so the surface you are looking at is not the one a visitor
gets, and a whole class of bug (a space that is private, an invite that grants
nothing, a share link that signs the recipient out) cannot be reproduced or even
seen. Turn it off only when you are deliberately testing something else, and
remember the box is then lying to you about access.

Leave `CORS_ORIGINS` alone if you are unsure: the placeholder from
`.env.example` (`https://your-domain.com`) rejects `localhost:5173`, and
`npm run dev` only survives it because the dev stack overrides the value for the
server it starts. Running `npm run dev:server` on its own with the placeholder
in place gives you a server the client cannot talk to.

## 6. Run it

```bash
npm run dev
```

This starts **serverXR** (`http://localhost:4000`) and the **Vite client**
(`http://localhost:5173`) together. Useful routes:

- `http://localhost:5173/spaces` — your spaces
- `http://localhost:5173/main` — public view
- `http://localhost:5173/main/studio` — main editor
- `http://localhost:5173/main/raw/projects` — the node editor (Raw; `beta` was
  deleted in Aug 2026 and its route is gone)
- `http://localhost:5173/admin` — ops
- `http://localhost:4000/serverXR/api/health` — server health check

**A fresh database has two spaces in it — `main` and `open` — and nothing else.**
Every space you have seen on the live site is missing until you bring it down:

```bash
npm run local:mirror:check   # read-only: what the live tiers have that you don't
npm run local:mirror         # create them and pull their projects
```

Nothing does this for you, and nothing used to say it was needed — a missing
space looks exactly like a space that was never made. `npm run dev` now names
them at startup. The whole picture, and the three other things that go stale
independently, is in [docs/ai/local-workflow.md](docs/ai/local-workflow.md).

> **Already have a copy running?** If ports 4000/5173 are taken (e.g. a second
> clone), move the server with
> `VITE_API_BASE_URL=http://localhost:4001/serverXR npm run dev`
> (serverXR → 4001). On PowerShell:
> `$env:VITE_API_BASE_URL='http://localhost:4001/serverXR'; npm run dev`
>
> The **client does not move with it**: Vite runs with `strictPort` on purpose,
> so it fails to start rather than quietly picking 5174 — a second client on a
> guessed port is how you end up reading a page served by the other clone. Free
> 5173, or start the client yourself on a port you chose:
> `npx vite --port 5176 --strictPort`.

## 7. Daily workflow

```bash
git switch dev
git pull --ff-only origin dev     # or: git pull --ff-only upstream dev
# ...make changes...
npm run lint && npm run build && npm run test -- --run   # validate before pushing
git switch -c <type>/<short-name>  # e.g. fix/viewport-height
git add -A && git commit -m "..."
git push -u origin HEAD
gh pr create --base dev            # open a PR (add --repo dob-0/di.iiii to target upstream)
```

If you're using an AI agent to do the work: it can run the validate/commit/push
steps above on its own once a task is done, without asking each time — pushing
only ever updates your own fork, never upstream directly. See
`docs/ai/parallel-agents.md` (Mode 0) for the exact contract.

## 7b. Optional: auto-open the PR on push (one-time setup)

Skip `gh pr create` entirely by letting a push open the PR for you:

1. Copy `docs/templates/fork-auto-pr.yml` from upstream into your fork at
   `.github/workflows/auto-pr.yml`
2. Create a personal access token (fine-grained: `Pull requests: write` +
   `Contents: read` scoped to `dob-0/di.iiii`) and save it as a repo secret
   named `UPSTREAM_PR_TOKEN` in your fork's settings — this step needs a human
   to click through GitHub's UI, an agent can't do it unattended
3. From then on, every push to a non-`dev`/`main` branch in your fork opens
   (or updates) a PR against `dob-0/di.iiii`'s `dev` automatically

Branch rules (see `README.md` / `CURRENT.md`):

- Normal work happens on **`dev`** → deploys to staging.
- Promote **`dev` → `main`** for production. Don't start feature work on `main`.

## 8. Working with Claude Code (the team's AI workflow)

The project's AI workflow is **already checked into the repo** — do not invent
your own or let a fresh Claude session improvise one. When you start `claude`
from the repo root, it automatically gets:

- `CLAUDE.md` → `AGENTS.md` — the working contract: role routing, scope rules,
  validation commands, branch flow
- a session-start hook that prints `CURRENT.md` (live project state) at the top
  of every session
- `.claude/settings.json` — the pre-approved permission allow-list (npm, git,
  scripts, docker…) plus guard hooks (pre-push validation gate, schema-sync
  warnings)
- `.mcp.json` — the `context7` (library docs) and `playwright` (browser
  testing) MCP servers
- `.claude/agents/` role subagents and `.claude/commands/` slash commands
  (`/branch`, `/check`, `/ship`, `/stack`, `/live`)

What each person still does **once**, on their own account:

1. Install Claude Code: `npm install -g @anthropic-ai/claude-code` (or the
   native installer from claude.com/claude-code).
2. Run `claude` and log in when prompted — either a Claude.ai subscription
   (Pro/Max/Team seat) or an Anthropic Console API key. This is personal
   auth/billing; **never paste an API key into any file in this repo**.
3. Start `claude` from the repo root. The first session asks whether to trust
   the project's settings, hooks, and MCP servers — accept, or none of the
   workflow above loads.
4. Install the two standard plugins (inside a Claude session):

   ```
   /plugin install frontend-design@claude-plugins-official
   /plugin install security-guidance@claude-plugins-official
   ```

Good first prompt: *"Read CURRENT.md and AGENTS.md and summarize how work
happens in this repo"* — cheaper than letting the session discover it mid-task.

Personal overrides (your own notes, extra permissions) go in `CLAUDE.local.md`
or `.claude/settings.local.json` — both gitignored, never in the tracked files
above. If you work from a fork, Claude follows the Mode 0 contract in
[docs/ai/parallel-agents.md](docs/ai/parallel-agents.md): validate → commit →
push to a task branch on *your fork* automatically; it never pushes upstream.

## 9. Known Windows gotchas (already handled)

- **`npm run dev` → `spawn EINVAL`**: Node 24 won't spawn `npm.cmd` directly.
  Fixed in `scripts/dev-stack.mjs` (`shell: true` on Windows). If you see this,
  pull latest.
- **serverXR won't start (`ENOENT ... .env`)**: you skipped step 5 — create
  `serverXR/.env` and `serverXR/.env.local`.

---

That's it. If something here drifts from reality, fix this file in the same PR —
keeping onboarding accurate is everyone's job.
