# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

**dev is ahead of prod (2026-08-01): dependency batch + fixes, staging-verified,
awaiting owner click-through before promoting `main` (prod still at `0c568c02`).**
Landed on dev: express 5, three 0.185, jsdom 30, dotenv 17, six actions/docker
bumps (dependabot queue 15 → 2), legacy WCC page self-hosted (zero third-party
requests anywhere now), Raw enter-world fullscreen fix, `time` palette-label fix,
Raw wiki article. Several agents share this tree: re-check `git log`, and
**stage explicit paths, never `git add -A`**.

## Last session (2026-08-01)

- **The three owed browser verifications all PASS** (headless Playwright on
  staging): Raw deep nesting (3 levels, scoped edges, Esc unwind, fullscreen
  round-trip), EXIF round-trip (real sideways portrait: orientation baked in,
  zero EXIF/GPS in served asset, assetId = sha256 of scrubbed bytes), Time node
  ticking (pixel-diff proof; rAF gated on Time node existing). Two bugs found
  and fixed, rows in known-fixes: Raw "Enter ›" fullscreen race
  (`resolveScopeWorldNode` in `viewportWorldState.js`), stale `authoringOnly`
  on `time` (guard: registry test parses the runtime evaluator's case list).
- **Dependency verdicts** recorded in `docs/ai/dependency-decisions.md`:
  MUI 9 = pigment-css styling-engine migration (deferred, with React 19);
  node 26 = wait for LTS (~Oct 2026; the 2 open PRs are deliberate);
  drei 10/MUI told `@dependabot ignore this major version`.
  jsdom 30's PR "failure" was a stale base — suite green on current dev.
- **Off-box backup is now scheduled**: systemd user timer `di-backup-pull`
  daily 09:00 local + linger, first run verified (18 archives, 11G). Still
  unencrypted at rest.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups + daily off-box pull.

## Open

- **Promote dev → main after owner click-through on staging** (express 5 +
  three 0.185 are the risk surface; automated checks green).
- Privacy, product calls owed: no account-deletion path, no export, no session
  revocation. Backup archives unencrypted at rest.
- URL spec §7 needs sign-off; blocks Stage 2. Stale GitHub App key; `main`
  protection bypassable. `docs/ai/INBOX.md`: sound-in-spaces; promo outbound.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
