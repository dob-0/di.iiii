# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**`dev` is AHEAD of `main`** — staging deployed and verified (`deployEnv:
staging`, running the pushed sha, host key pinned); prod is on the earlier tier.
Several agents share this tree: re-check `git log`, **stage explicit paths**.

## Last session (2026-08-04, second)

- **The GitHub App was never wired into the VPS deploy.** Its secrets lived in
  cPanel's deploy.env; the 2026-07-15 move replaced that with compose and
  carried over only the OAuth vars, so `isConfigured()` was false on both hosts
  for three weeks — silently, by design. Compose now passes all three (+
  `STAGING_` twins), `.env.example` documents them, runbook rewritten for the
  VPS, guard derives the names from `githubApp.js` itself.
- **The flaky suite is fixed.** Reproduce deliberately: two full suites at once
  → 5 of 6 runs failed, vs 8/8 sequential. Three defaults sized for an idle
  machine (Vitest 5s vs server-spawning contracts, DTL's 1000ms `findBy`, one
  synchronous read of SpaceHub's two-settle preview). After: 10 summaries under
  the same load, 1561/1561 each.
- **`VPS_HOST_KEY` is set** — deploy log confirms the pin branch, no keyscan.
- **§7 now carries a recommendation per question** so it can be signed. It
  corrects its own premise: entities already nest (`parentId`, recursive
  render, drag-reparent) → address `entities[]`, build no bridge. Still unsigned.
- **Workstation, not repo:** a hard crash left a zero-length commit object and
  an unparseable `HEAD` (git doesn't fsync loose objects by default). Repaired;
  `core.fsync` widened globally here.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Generate the GitHub App secrets** (`docs/ops/ROTATE_GITHUB_APP_SECRETS.md`
  1–3, App `4178187`). Wiring is live; the values are not, so sync stays off.
- **`LIVE_API_TOKEN` (staging) is stale** — 401; staging's br_id_ge is older.
- **`dev → main` promotion owed.**
- **The `br_id_ge ▾` chip covers the field's Armenian letter-row**; narrow
  phones also collide the bottom links. Owner's call — published-project layout.
- Privacy calls owed: no account-deletion, export or session revocation; backups
  unencrypted. §7 sign-off blocks Stage 2. `docs/ai/INBOX.md`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
