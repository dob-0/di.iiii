# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: fix/audit-2026-08-05
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

**`main` is LIVE at `fed578f9`**, `dev` one docs commit ahead at `acb2deb4` — promoted
2026-08-05, both deploys green, both hosts self-report the commit. Prod verified after:
guest session issues (the new token_version path), mesh still open, code-mode fetches no
`three-vendor`, scene + door **looked at**. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-05 — full audit, then the six decisions)

- A 54-agent audit ran against a tree **51 commits behind `dev`** — much of it was already fixed. Check `git rev-list --left-right --count HEAD...origin/dev` BEFORE any fan-out; re-verify every finding against current code before fixing.
- Shipped on `dev`: gzip was dead in prod (Caddy's `Via` header + `gzip_proxied off`, 2125→682 KB), `vps-restore.sh` could destroy live data from a corrupt archive, staging was published on 0.0.0.0, two authorization holes, a stored XSS, and a collab data-loss path.
- `f74b7184`: **session revocation** via `users.token_version` — logout was cookie-only, so a copied cookie stayed valid 12h and nothing could be revoked; now wired through Socket.IO too.
- `f74b7184`: the **mesh identity gate**. `/serverXR/mesh` was ungated AND ungatable (no compose file passed `MESH_ROOM_SECRET`). A blanket secret is impossible — visitors' browsers are mesh clients — so the gate is asymmetric: relay open, `keeper-*` needs the secret. Inert until a value is set — one of three decisions taken but not built, all owner-blocked (below).
- `f74b7184`: code-mode published pages no longer pull `three-vendor` (**541→75 KB gzipped**), proven by walking the built chunk graph and confirmed in a browser. Both changed paths were **looked at**.
- Every push reported `Bypassed rule violations for refs/heads/dev` — branch protection's required checks do not stop this account.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups;
staging's `LIVE_API_TOKEN` (a real `PATCH` returned 200 on 2026-08-05).

## Open

- **Trees:** `~/di.iiii` drifts under whoever is working — today it is on `fix/audit-2026-08-05`, and **:5173** (the only server up) serves whatever is on its disk, so name the branch before you say "go look". `~/di.iiii-algomerge` is on `dev`; `dev-preview` is detached at `5f4cd3a9`, stale. **Push when you finish** — `dev` self-deploys and a red `dev` freezes staging for everyone; check `gh run list --branch dev --limit 1`.
- The `open` space's card is blank (no `publishedProjectId` of its own, same hole algovrithm was in); Studio's director page has never been seen with a real session — `/algovrithm/studio/director` is OAuth-gated, geometry verified, picture not.
- Reel globe's world `#04050A` fails the piece's own purple-gap check (`sequences/index.js`) — artist's call; keyboard scroll is dead app-wide (`/wcc` too), only `/algovrithm` was fixed.
- The `br_id_ge ▾` chip covers the field's Armenian letter-row, and narrow phones collide the bottom links; published **scene** framing sits bottom-left with most of the frame empty — reproduced identically on staging, so **pre-existing**, not from the viewer split. Both owner's calls.
- **The mesh gate is INERT in prod** — the code is live but no `MESH_ROOM_SECRET` is set, so the keeper is still impersonable; set a distinct value per tier in the VPS `.env`, then deploy the three keeper clients that now carry it.
- **The leaked GitHub PAT and staging Google OAuth secret are still live** — rotation untouched; 13 dead GitHub secrets also want revoking (6 repo-level FTP/cPanel, 7 in the `staging` env).
- Privacy calls owed: no account-deletion or export; **backups still unencrypted** (`age` decided, not built — and installed on neither the VPS nor the Mac). §7 blocks Stage 2 — `docs/ai/INBOX.md`.
- **Owner-blocked, decided but unbuilt:** Telegram chat id for backup-failure alerts (and a webhook cannot fire if cron never runs at all); where the `age` private key is stored; mint a staging `LIVE_API_TOKEN` or point `deploy-space-code.yml` at the existing `staging` env's `SERVERXR_API_TOKEN` (that workflow fails on every triggering push today).
- **`feat/timeline-core` is UNPUSHED and checked out nowhere** (5 ahead of `dev`, 51 behind it): it moves the director to `src/raw/director/`, adds `view.director`/`view.timeline` nodes and `src/project/timeline/timelineCore.js` — so the Raw representation exists, but not on `dev`. It branched **before** the phone fix and still carries the old two-corner chrome, so a careless merge re-introduces the overlap; `chromeLayout.test.js` is what catches that. Land it deliberately.

## Deploy & validation — known fixes: [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
