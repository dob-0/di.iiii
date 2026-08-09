# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- chain fixes from the collaborator-onboarding discovery walk

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation in progress** — Studio-as-a-node rebase + Raw-as-default promotion pending, see Last session / plan file above.
- **Real-browser looks owed**: `source.webcam`/`source.mic` (camera+mic needed) +
  PR #93's 4 items (Inspector wheel-scroll, audio toggles, primitive clamping).
- All 8 prod spaces owned (queried prod 2026-08-08); releasing ownership doesn't
  revoke the scope it granted (deliberate). Mesh gate ARMED both tiers; leaked
  PAT inferred-closed; **staging Google OAuth secret parked by the user** —
  rotation script staged, see memory `reference-leaked-secrets`.
- **Nothing watches free disk** except di-bo now; no per-space or per-account byte quota exists
  anywhere, and no ENOSPC pre-check — writes run until the volume physically fills.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap
  check fails. `feat/timeline-core` is PR #100 (dead ports being stripped).
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- Staging deploy pending as of session end — GitHub Actions infra was degraded (stuck queues across unrelated branches too); check `gh run list --repo dob-0/di.iiii --branch dev` before assuming it landed.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
