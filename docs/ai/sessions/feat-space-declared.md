## 2026-08-06 — a space can be owned, declared, and joined; the desk leaves the public repo

- **Ownership after creation.** `PATCH /api/spaces/:id` accepts `ownerUserId` (admin-only;
  handing someone a space is a grant, not a preference), `null` releases it, an unknown id
  404s and a `guest:` subject 400s. Ownership and scope were separate grants, so assigning
  one without the other produced an owner who could not open their own space — the route now
  does both in one call. Preferences → Manage grew an "Owner & access" section that names the
  missing owner in words. Fourth instance of the create-only-field bug (project slug v3,
  project title v4, space label v5, this one a level up on the platform's own object).
- Found alongside it: `serverSpaces.js` forwarded neither `ownerUserId` nor `slug`, so
  **"Edit public link" in Manage had never once done anything** — the server supported the
  field and the client dropped it. A button that posts nothing looks exactly like a button
  that works.
- **All 8 production spaces adopted** (owner's call, taken 2026-08-06): `main`, `open`,
  `algovrithm`, `azd`, `br-id-ge`, `platform-recordar` → Gevorg (thedi.studio);
  `wcc`, `beyond-form` → emilyanikoghosyan. Verified on the live host: owner set, scope
  granted alongside, and labels / `isPublic` / `publishedProjectId` all untouched.
  **Releasing ownership does not revoke the scope it granted** — deliberate (losing a space
  should not lock you out of it), but it means `null` is not a full undo.
- **The algovrithm Director can save from the live site.** Its only save was a Vite
  dev-server middleware, so a collaborator could retime the whole piece on di-studio.xyz and
  lose it on reload — no error, just work that quietly did not exist afterwards. New
  `GET/PUT /api/spaces/:id/settings` (one opaque JSON blob per space, 64 KB, deliberately
  schema-free because what the keys mean belongs to the piece) plus a timing **overlay** —
  changed fields only, diffed against the file — resolved before the clock is built, on a
  1.5s deadline, ignoring a late answer so the playhead never jumps mid-beat. Seen working
  on a production build with no dev server.
- **"Invite carries its role" was dropped after measuring** — new accounts already default to
  `editor` and a redeeming guest can `PUT` a scene, so there was no bug. Built the real gap
  instead: `joining-a-space` in the wiki is the browser-only path end to end, `README` and
  `ONBOARDING` now fork into two doors rather than assuming the developer one, and both
  AuthGate cards link to it when an invite is in hand. Note for testing it: with guests
  enabled the sign-in card is the rare branch — an invitee lands on the *restricted* card.
- **Every space is declared.** Engine v6 reads an empty `projects` list as a space-only
  declaration, which is what lets a Studio-authored space (`main`, `open`, `wcc`, `azd`) or a
  code space (`algovrithm`, whose scene is React in `src/`) be declared at all — before this
  `--audit` could read such a declaration and nothing could apply one. `spaces/<id>/
  di-space.space.json` for the five di.iiii-native ones, one each in `beyond_form` and
  `platform_recordar`, and `npm run spaces:audit` walks them all read-only. The two linked
  repos also lost the `"live": <prod url>` pin their v4 manifests carried, so a run that
  forgets its target now errors instead of publishing.
- **`docs/promo/` left the public repo** for a private `dob-0/di.iiii-ops` — grant calendar
  with amounts, deadlines and contact emails, a named stakeholder tracker, the revenue model,
  four unsent announcements. Cut by kind, not by file: deploy docs, the secret-*rotation*
  runbook and the host identifiers stayed, because a self-hoster needs them and none is a
  secret. `git rm` does not remove history — treat all of it as already seen.
- **CURRENT.md's own 50-line limit is now a CI check.** It was written in the file's first
  line and read by nothing; it went over three times in one session, caught each time only by
  a person running `wc -l`. `golden_rules.md` now records which half of the contract CI
  enforces and which half is discipline.
- **Still undone:** the three linked repos (`br_id_ge`, `beyond_form`, `platform_recordar`)
  hold **uncommitted** v6 engine copies and new space manifests — vendoring locally changes
  nothing their CI runs, so someone has to commit and push each repo.
- I turned `dev` red once, briefly: `npm run docs:ai:check 2>&1 | tail -2 && git push` takes
  its exit status from `tail`, so a failing check printed "failed" and the push ran anyway.
  The run before mine was already red for the same line-limit reason.
