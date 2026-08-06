# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — br_id_ge visibility/UX fixes + a stuck deploy pipeline)

- Promoted Raw from a buried `.sh-link` text row to an outlined top-row button in Studio Hub, next to "+ New".
- Hid br_id_ge's tech rider ("needs dash", `br-id-ge-needs`) from the public `ProjectSwitcher` via new `SPACE_PROJECT_HIDDEN` — it was public and copy-linkable next to the field/rite/landing; project and its direct URL are untouched.
- `ProjectSwitcher`'s pill also went low-contrast-at-rest (full contrast only on hover/focus/open) — landed by another concurrent session on top of the above.
- Fixed two live bugs in br_id_ge's rite itself (a hand-authored `index.html` code-space, not this repo): Act III's blessing text had no backdrop against the ambient letter-scatter canvas (added a radial-gradient + blur scrim), and Act V's action links had zero idle motion (added a staggered opacity/translateY animation, `prefers-reduced-motion`-guarded). Verified page loads clean with no console errors; the acts themselves are camera-gesture-gated so a human still needs to confirm on a phone.
- Found and landed a real, unrelated CI blocker: a stray `docs/ai/sessions/chore-sync-safety-rescue.md` (from a branch merged without `npm run land`) was failing the AI-docs gate for every push behind it — fixed via `npm run land` itself.
- GitHub Actions had a rough stretch today (action-download 503s, a stuck webhook, a runner queue stuck at zero progress for 25+ min across multiple unrelated branches) — not code-related. Deploy to staging was still pending when this session ended; re-dispatch via `gh workflow run deploy-vps-staging.yml --ref dev` if it's still stuck.

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation in progress** — Studio-as-a-node rebase + Raw-as-default promotion pending, see Last session / plan file above.
- **Real-browser looks owed**: `source.webcam`/`source.mic` (camera+mic needed) +
  PR #93's 4 items (Inspector wheel-scroll, audio toggles, primitive clamping).
- 8 prod spaces still ownerless (staging verified end to end; prod gets it next
  promotion); releasing ownership doesn't revoke the scope it granted (deliberate).
- **Mesh gate INERT in prod** (no `MESH_ROOM_SECRET`); **leaked GitHub PAT +
  staging Google OAuth secret still live**, 13 dead secrets to revoke.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap
  check fails. `feat/timeline-core` UNPUSHED.
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- Staging deploy pending as of session end — GitHub Actions infra was degraded (stuck queues across unrelated branches too); check `gh run list --repo dob-0/di.iiii --branch dev` before assuming it landed.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
