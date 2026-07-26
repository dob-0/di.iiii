# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

`dev` = `main` = prod = staging = `bada1cbd` — all pushed, both deploys
green, both envs live-verified 2026-07-26. Production hold is lifted:
everything through the open-jam feature set is live.

## Last session (2026-07-26 — Open Studio un-hijacked, CI audit unblocked, dev→main)

- Fixed user-reported bug: logged-out landing "Open Studio" dumped visitors
  into the stripped-down jam editor (`StudioHub`'s open-space auto-forward
  caught the CTA). Landing "Open Studio"/"Studio" now use `?browse=1`;
  "Step inside" keeps the plain jam door. Tests lock both (`6c795fce`).
- Staging deploy then failed on CI's `npm audit --audit-level=high` gate:
  new libvips CVEs in transitive `sharp@0.34.5`. Root `overrides` now forces
  `sharp@^0.35.3` (`bada1cbd`). 2 moderate react-router advisories remain —
  fix is a breaking v7 upgrade, deliberately deferred; they don't gate.
- Rebased a diverged local `dev` (concurrent-session recap vs pushed
  open-jam work); moved all Jul 16–21 session detail into PROGRESS.md.
- Promoted `dev → main` on user request; verified live headlessly on both
  envs (hrefs correct, zero page errors).

## What works

- Studio (six desktop panels + phone layout), Beta, WCC, viewer; auth
  (session-cookie, roles, OAuth-first, CSRF) + open-space/sandbox grants
- Open Jam live on prod: `/open_jam` short link, minimal jam mode +
  JamEditPanel, "All tools" toggle
- Vanity links live; deploys via `git push origin dev|main`; nightly VPS
  backups; `src/seed/` dev lane (free nesting, verified live)

## Open

- Owner-logged-in click-throughs still owed: admin slug-edit UI,
  ProjectSwitcher "Copy link", admin/preferences reorg visual check.
- Nested-World WebGL context-loss/tab-freeze bug — reproduced, unfixed.
- react-router v7 upgrade (2 moderate advisories); ~23 untriaged audit
  findings; stale GitHub App key; off-box backup copy missing.
- Promo/licensing: user owes demo recording, warm contacts, outbound
  approvals. `docs/ai/INBOX.md`: sound-in-spaces parked.
- Custom domains + space export (`SPEC_space_urls_and_portability.md`)
  plan-only; `/privacy` route unwired; `main` branch protection bypassable.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
