# Onboarding — di.iiii

Welcome. This is the **one-stop setup** so a new person can clone the project,
run it locally, and start contributing the same way the rest of the team does.
Follow it top to bottom. Tested on Windows 11 + Node 24; notes for macOS/Linux
inline.

> TL;DR for the impatient: install prerequisites → fork & clone → `npm install`
> (root **and** `serverXR`) → create `serverXR/.env` → `npm run dev` → open
> `http://localhost:5173/main`.

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

In `serverXR/.env`, for easy local use set:

```
REQUIRE_AUTH=false
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## 6. Run it

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

## 8. Known Windows gotchas (already handled)

- **`npm run dev` → `spawn EINVAL`**: Node 24 won't spawn `npm.cmd` directly.
  Fixed in `scripts/dev-stack.mjs` (`shell: true` on Windows). If you see this,
  pull latest.
- **serverXR won't start (`ENOENT ... .env`)**: you skipped step 5 — create
  `serverXR/.env` and `serverXR/.env.local`.

---

That's it. If something here drifts from reality, fix this file in the same PR —
keeping onboarding accurate is everyone's job.
