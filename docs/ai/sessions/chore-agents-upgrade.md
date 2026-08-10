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

## 2026-08-11 — the defects the doc pass turned up, fixed

Correcting the docs surfaced real code and tooling defects. Each was verified before being
acted on, and each fix carries its own proof rather than an assurance.

**A failed delete could silently unpublish a space.** `RawHub.jsx` cleared
`publishedProjectId` *before* calling `deleteProject`, so a delete that threw left the space
unpublished with the project still sitting there — a visitor's live page goes blank and
nothing says why. Studio already did it in the safe order and carries a comment explaining
exactly this. RawHub now matches, and the regression guard was run against the unfixed code
first and watched to fail: it caught the pointer being cleared anyway
(`["gallery", { publishedProjectId: null }]`).

**Two more delete sites had the other half of the same bug**, found while fixing the first —
`AdminManageSection.jsx` never cleared the pointer at all (dangling pointer on the admin
surface, the one most likely to be used on someone else's space), and
`StudioProjectsPanel.jsx` set the "deleted but the pointer could not be cleared" warning and
then called `loadProjects()`, which clears status on success — so the user was never told.

**Three months of dead layout scaffolding removed from Raw.** `workflowRef` was declared,
read by a `ResizeObserver`, and never attached to any element. `git log -S` found the cause:
commit `9968ab00` (May 2026) deliberately deleted the contextual workflow strip when the
window-based workspace landed, and the ref, the observer, `workflowHeight` and
`src/raw/utils/surfaceWorkflow.js` all survived it. Removal proven a no-op by rendering
before and after at DPR 2 — byte-identical screenshots, zero differing pixels.

**A CSS declaration that resolved to nothing.** `raw.css` used `var(--di-card)` with no
fallback, and `--di-card` is defined nowhere; repointed to `--di-surface`, the token the
identical neighbouring card already uses. The fix is invisible for a reason worth recording:
`.raw-card` is itself dead CSS — no element in the repo carries the class. It was proven by
injecting a probe element and reading computed style: `rgba(0,0,0,0)` before,
`rgb(10,10,10)` after, matching the live reference card.

Four more tokens (`--di-accent`, `--di-bg`, `--di-dim`, `--di-line`) are also undefined but
carry inline fallbacks and render correctly. Deliberately left alone — repointing them would
visibly restyle Studio surfaces, and defining them at their fallback values would enshrine
four off-palette hexes beside the canonical ones. That is a design-system decision, not a
bug fix.

**Every skill anchor in the repo was broken.** All 15 `.github/skills/*/SKILL.md` used
`../../`, which from `.github/skills/<name>/` resolves to `.github/` — so not one anchor
pointed at a real file. Swept to `../../../`; all **106 anchors now resolve, 0 broken**,
checked by resolving each against the filesystem.

**A guard that made a true fact undocumentable.** `check-agent-docs.mjs` bans the legacy
cPanel workflow and branch names anywhere in its scanned paths — a good rule, added after an
agent cited the dead deploy path from memory. But it meant you could not write down *why*
that workflow is inert. One allowlist entry added for the documentation-engineer card, which
now states the rule in full; the guard was proven still to fire by planting a probe citation
in a non-allowlisted file, watching the check fail, and removing it.

Also corrected: `dii-project-asset-transport` cited `projectImportAssets.js`, which never
existed (real code is `src/project/transfer/studioProjectBundle.js`); `src/project/AGENTS.md`
cited the same phantom test; `serverXR/ecosystem.config.js` is now marked as PM2/cPanel
legacy rather than sitting unmarked and reading as current.

Open, deliberately not done:

- `.raw-card` and `.raw-hub-grid` are dead CSS blocks. The declaration inside was fixed
  rather than the block deleted — deletion was not in scope and wants a decision.
- The four fallback-carrying undefined tokens, above.
