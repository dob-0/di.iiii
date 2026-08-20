# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- Why

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- Lane consolidation MERGED 2026-08-13 (#99+#121). Raw-as-default landing promotion
  still open — owner's call, MANIFESTO §6 gates it.
- Real-browser looks ALL CLOSED — webcam 2026-08-13, `source.mic` 2026-08-18 (see PROGRESS).
- All 8 prod spaces owned; releasing ownership keeps granted scope (deliberate).
  Mesh gate ARMED both tiers; **staging Google OAuth secret parked by the user**
  — rotation script staged, see memory `reference-leaked-secrets`.
- ENOSPC pre-check SHIPPED 2026-08-18 (`MIN_FREE_DISK_MB` 507 floor); per-space byte
  QUOTA still unset — needs an owner policy number.
- Deps 2026-08-18: #151 promoted + 6 safe bumps. Parked: eslint-10 #148, router-7 #150,
  checkout-7 #143 (conflicts; its windows install-test fails).
- `open` card = upload the honest teal frame — decided 2026-08-13, pending staging
  API token then prod approval. Director page still unseen. (Purple-gap: CLOSED.)
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- **Prod room append path unproven** — record is empty by design (no backfill); the first real spoken line on di-studio.xyz/br_id_ge/field is both the proof and the room's first memory.
- **Tunnel telegram first-binding untested by any human** — needs a telegram account with NO prior @diiii111bot chat.
- Remaining trees, each with a reason: raw-ws (active session), inscription-mark / rawadmin / design-loading-unify / agents-upgrade (unmerged work — park or PR, owner's call).

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
