# Onboarding — di.iiii (self-host branch)

Welcome. This is the **clean, local-only setup** — clone, run, and use your
own copy with no GitHub CLI, no token, no fork, no PR flow. Follow it top to
bottom. Tested on Windows 11 + Node 24; notes for macOS/Linux inline.

If you want to contribute changes back upstream or collaborate with others
instead, switch to the `dev` branch and follow the fork + PR flow there
(`docs/ai/parallel-agents.md`) — none of that applies on this branch.

> TL;DR for the impatient: install prerequisites → clone → `npm install`
> (root **and** `serverXR`) → create `serverXR/.env` → `npm run dev` → open
> `http://localhost:5173/main`.

---

## 1. Install prerequisites (once per machine)

| Tool | Why | Windows (winget) | macOS (brew) |
| --- | --- | --- | --- |
| **Git** | clone / pull | `winget install Git.Git` | `brew install git` |
| **Node 22.x** (24 also works) | runs client + server | `winget install OpenJS.NodeJS.LTS` | `brew install node` |

Verify:

```bash
git --version
node -v
npm -v
```

## 2. Get the code

```bash
git clone --branch self-host https://github.com/dob-0/di.iiii.git
cd di.iiii
```

## 3. Install dependencies (root AND serverXR)

There are **two** package trees — install both:

```bash
npm install
npm --prefix serverXR install
```

> Node 24 prints an `EBADENGINE` warning (engines ask for 22.x). It's only a
> warning; the app runs. To silence it: `npm install --engine-strict=false`.

## 4. Create the local server env

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

In `serverXR/.env`, for easy local use set:

```
REQUIRE_AUTH=false
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## 5. Run it

```bash
npm run dev
```

This starts **serverXR** (`http://localhost:4000`) and the **Vite client**
(`http://localhost:5173`) together. Useful routes:

- `http://localhost:5173/main` — public view
- `http://localhost:5173/main/studio` — main editor
- `http://localhost:5173/main/beta` — experimental node editor
- `http://localhost:5173/admin?space=main` — ops
- `http://localhost:4000/serverXR/api/health` — server health check

> **Already have a copy running?** If ports 4000/5173 are taken (e.g. a second
> clone), run this one on other ports:
> `VITE_API_BASE_URL=http://localhost:4001/serverXR npm run dev`
> (serverXR → 4001, Vite auto-picks 5174). On PowerShell:
> `$env:VITE_API_BASE_URL='http://localhost:4001/serverXR'; npm run dev`

## 6. Daily workflow (self-hosted, no GitHub PR flow)

This branch is the clean self-host path: no `gh` CLI, no token, no fork, no
PR — just your own running copy you keep updated by pulling.

```bash
git pull --ff-only origin self-host   # get the latest clean copy
npm install && npm --prefix serverXR install   # if dependencies changed
npm run dev
```

If you're modifying the code for your own use, just commit locally — there's
no upstream contribution flow on this branch. If you later decide you want to
contribute changes back or collaborate with others, switch to the regular
fork + PR workflow described in [docs/ai/parallel-agents.md](docs/ai/parallel-agents.md)
on the `dev` branch instead.

## 7. Known Windows gotchas (already handled)

- **`npm run dev` → `spawn EINVAL`**: Node 24 won't spawn `npm.cmd` directly.
  Fixed in `scripts/dev-stack.mjs` (`shell: true` on Windows). If you see this,
  pull latest.
- **serverXR won't start (`ENOENT ... .env`)**: you skipped step 4 — create
  `serverXR/.env` and `serverXR/.env.local`.

---

That's it. If something here drifts from reality, fix this file in the same PR —
keeping onboarding accurate is everyone's job.
