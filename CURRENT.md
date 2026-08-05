# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

**`dev` and `main` are LEVEL at `535c03e4`** — promoted 2026-08-05, both deploys green,
both hosts 12/12 (`npm run verify:algovrithm:remote -- <host>`), prod phone header seen
at 390px. Several agents share this tree: re-check `git log`, **stage explicit paths**.

## Last session (2026-08-05/06 — `feat/space-declared`, UNPUSHED)

- A space can be given an owner **after** creation — `PATCH /api/spaces/:id` takes `ownerUserId` (admin-only, `null` releases) and grants scope in the same call; Preferences → Manage grew an "Owner & access" section (`05e46fab`). Fourth instance of the create-only-field bug; the rule is now in `golden_rules.md`.
- Found alongside it: `serverSpaces.js` never forwarded `slug`, so "Edit public link" in Manage had **never** done anything.
- The algovrithm Director now saves from the live site — new `GET/PUT /api/spaces/:id/settings` (opaque JSON, 64 KB cap) plus a timing overlay resolved before the clock is built; **seen** on a production build with no dev server, 5.6s→8s survived a cold reload (`4e91cbc4`).
- "Invite carries its role" was **dropped after measuring**: new accounts already default to `editor` and a redeeming guest can `PUT` a scene — there was no bug.
- Public-repo audit: no tracked credentials, but `docs/promo/` holds the grant calendar, amounts, a named stakeholder tracker and unsent announcements.
- An invited collaborator got a door of their own — `joining-a-space` in the wiki is the browser-only path, `README`/`ONBOARDING` fork into two doors, and both AuthGate cards link to it when an invite is in hand (`066a84bc`).
- **All 8 prod spaces are now declared.** Engine v6 reads an empty `projects` list as a space-only declaration, so Studio-authored and code spaces can be declared at all; `npm run spaces:audit` walks every one, read-only. Prod and staging agree on every declared field.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups;
staging's `LIVE_API_TOKEN` (a real `PATCH` returned 200 on 2026-08-05).

## Open

- **`feat/space-declared` is UNPUSHED**; nothing has touched staging or prod. The three linked repos (`br_id_ge`, `beyond_form`, `platform_recordar`) hold **uncommitted** v6 engine copies + new space manifests — vendoring locally changes nothing CI runs.
- **`/home/nooo/di.iiii-ops` exists locally, one commit on `main`, no remote.** Create `dob-0/di.iiii-ops` **private** and push it — the grant calendar is out of `HEAD` here but `git rm` does not remove history, so treat it as already seen.
- The 8 prod spaces are still **ownerless**, and cannot be adopted until this branch ships: a `PATCH` with `ownerUserId` against the deployed build returns **200 and ignores it** (measured on staging). Three admins exist — `ginsyuz`, `dob-0`, `gevorg_aram1@thedi.studio` — so who adopts what is still a call. Recipe in `spaces/README.md`.
- **Trees:** `~/di.iiii` drifts under whoever is working — today it is on `fix/audit-2026-08-05`, and **:5173** (the only server up) serves whatever is on its disk, so name the branch before you say "go look". `~/di.iiii-algomerge` is on `dev`; `dev-preview` is detached at `5f4cd3a9`, stale.
  **Push when you finish** — `dev` self-deploys; a red `dev` freezes staging. Check `gh run list --branch dev --limit 1`.
- The `open` space's card is blank (no `publishedProjectId` of its own). Studio's director page has never been seen with a real session — `/algovrithm/studio/director` is OAuth-gated; geometry verified, picture not.
- Owner's/artist's calls: reel globe's world `#04050A` fails the piece's own purple-gap check; the `br_id_ge ▾` chip covers the field's Armenian letter-row and narrow phones collide the bottom links. Keyboard scroll is dead app-wide (`/wcc` too); only `/algovrithm` was fixed.
- Privacy calls owed: no account-deletion, export or session revocation; backups unencrypted. §7 blocks Stage 2 — `docs/ai/INBOX.md`.
- **`feat/timeline-core` is UNPUSHED and checked out nowhere** (5 ahead of `dev`, 51 behind it): it moves the director to `src/raw/director/`, adds `view.director`/`view.timeline` nodes and `src/project/timeline/timelineCore.js` — so the Raw representation exists, but not on `dev`. It branched **before** the phone fix and still carries the old two-corner chrome, so a careless merge re-introduces the overlap; `chromeLayout.test.js` is what catches that. Land it deliberately.

## Deploy & validation — known fixes: [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
