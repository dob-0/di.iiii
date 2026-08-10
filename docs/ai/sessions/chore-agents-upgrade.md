## 2026-08-11 — agents, roles and skills corrected against a full docs audit

A four-strand audit of the estate's documentation found 21 of the 40 agent/role/skill
definitions carrying references to things that no longer exist, and six documents that
were not merely stale but *actively misleading* — unlabelled, and contradicting how the
system works today. This branch fixes the definitions and those six documents.

The ground truth every fix was checked against, re-verified on the day:

- Deploy is `dev` → `deploy-vps-staging.yml` → staging, `main` → `deploy-vps.yml` → prod;
  GHCR build, SSH to the Hetzner VPS, Docker Compose restart. The cPanel publish workflow
  has been `workflow_dispatch`-only since the 2026-07-15 cutover and its own header records
  that its smoke check fails every run — so any doc telling an agent to poll it for a deploy
  result was telling it to wait for something that never happens.
- The production deploy **waits for a manual approval**. A run at `waiting` is not `queued`.
- Beta was retired 2026-08-06 and absorbed into Raw. `src/beta/` is gone. `beta` stays in
  `RESERVED_APP_SEGMENTS` so it can never collide with a real space slug, and an old
  `/beta` link falls through to the unclaimed-space path rather than a broken screen.
- PM2 is gone (Docker Compose). Ollama/local models were removed 2026-08-05.

What changed here:

- `docs/ai/deploy.md` — described the `cpanel-*` branches as "the release artifacts" and
  said `/serverXR` is owned by the cPanel Node.js App. Both false. It also carried two
  byte-identical adjacent lines. Rewritten against the VPS path, with the approval-gate and
  the `release.gitCommit` health check spelled out.
- `docs/deploy/SSH_STAGING_DEPLOY.md` → moved to `docs/deploy/legacy/` with a banner. It
  documented `deploy-staging-ssh.yml`, which has been **deleted**; a `staging` trigger
  branch, which has never existed; and a PM2 restart. It was superseded before it shipped,
  so it is a design record, not recovery material — the legacy README now says so.
- `deploy/cpanel/DEPLOY.md` — the one cPanel document with no legacy header. Now has one.
- `public-README.md` — the outward-facing file still presented Beta as a first-class
  surface across seven sections and never mentioned Raw, while pointing contributors at
  `src/beta/`, a directory that no longer exists. Surfaces table, core model, local routes,
  where-to-work and status all corrected.
- `MANIFESTO.md` — two "Solved Shortcuts" verified a deploy by polling the dead cPanel
  workflow and watching `origin/cpanel-staging` move. Rewritten to check
  `release.gitCommit` at the health endpoint, which is the only check that proves *what* is
  running, and to say that a `waiting` run needs approval rather than patience.
- `AGENTS.md` — adjudicated a live contradiction. Line 59 demanded a summary at the end of
  every task; the operator's global `~/.claude/CLAUDE.md` forbids trailing summaries. Both
  were in force and every session resolved it by guess. Split by scope: the global file
  governs what you *say* in chat, this file governs what you *write down* in the session
  note, PR body or `CURRENT.md`.
- `.claude/agents/`, `docs/ai/roles/`, `.github/skills/` — corrected in parallel; see the
  diff. The role cards and skills carried the bulk of the rot, `.claude/agents/` the least.

Deliberately not done:

- The library of reading and audit reports that prompted this work lives in a **private**
  repo. No pointer to it was added anywhere in di.iiii, because di.iiii is public and that
  would publish a private repo name and a local home path — the same class of mistake the
  audit found elsewhere in the estate.
- `PROGRESS.md` still references the deleted `deploy-staging-ssh.yml`. Left alone: it is a
  dated historical log, and rewriting history entries to match the present is how a log
  stops being evidence.
