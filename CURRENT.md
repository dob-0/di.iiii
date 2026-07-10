# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`590337ab` — dev = UX-audit slices 1–5 & 7 merged (PRs #32–#37); staging deploy pending smoke.
Prod (`main`) is still at `4e080447` — promote after staging click-through.

## Latest session (2026-07-10 — full UX audit + fix roadmap, 6 slices shipped)

Cross-persona UX audit (guest/creator/viewer/WCC/collab/mobile/admin) → 7-slice roadmap.
Shipped to dev, each with tests + wiki + known-fixes:
- **#32 publish unified**: Share window + SpaceHub disclose public/private, one-click
  "Make space public", truthful set-live messages. No silent flips (by design).
- **#33 view→create**: `MadeWithBadge` on all public surfaces (viewer orbit/walk, WCC);
  hidden on ?preview=1 thumbnails.
- **#34 visual Studio help**: `StudioHelpDialog` (Move/Build/Edit/Share CSS diagrams,
  hotkeys = Shortcuts tab), guest first-run auto-open (`di.studio.welcomeSeen`).
- **#35 intent moments**: guest Share window = "Keep this work" (OAuth + export);
  OAuth returns `?auth=ok` → `AuthReturnNotice` toast (error finally surfaced too).
- **#36 surface the buried**: AuthGate OAuth-first (token behind disclosure); Drive
  section open by default; Settings/admin links admin-only.
- **#37 Studio on phones**: five-window bottom nav + sheets behind `isMobile`;
  desktop unchanged (`panelBodies` map shared by both layouts).

**Not built — awaiting user decision**: slice 6 self-serve sharing (owner-minted
invite links; the only slice touching the server access model). Design proposed.

**Env data sync (2026-07-10, parallel session):** local/staging/prod space content
now byte-identical (6 spaces; admin-API sync, backups in session scratchpad).
Open-call applications are DB-only, excluded from bundles — back up before any
data op: `scripts/backup-open-call-applications.mjs` (rule in golden_rules.md).

## What works

- Studio editor (five windows, now phone layout + visual help), Beta, WCC, public viewer
- Auth (session-cookie, roles, OAuth-first gate) with rate limiting; Admin Ops Graph
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- Staging click-through of the 6 UX slices pending (esp. phone Studio + guest welcome).
- Drive `drive.file`+Picker still blocked on Cloud console setup + real-account test.
- `serverXR/.env.local` stale GitHub App key — copy from a host's `~/.config/dii/*.deploy.env`.
- UX audit artifact (all personas, ranked findings): https://claude.ai/code/artifact/a739fd54-d04c-4cad-a18e-707470c36b0a

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
