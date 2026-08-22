## 2026-08-22 — the dev box says when it is behind, and Raw's work can leave the building

Two questions from the owner ("why is the local not synced" and "raw is not connected")
turned out to be the same shape: something was absent, and absence has no symptom.

**A dev box is four clocks, not one** — code, dependencies, data, identity — drifting
apart in silence. Only the tree ever spoke. Now `npm run dev` also reports how long
since the last `git fetch` (the behind-count is measured against that ref, so an
un-fetched clone reports itself current while six commits behind), which packages
disagree with the lockfile (nothing had ever checked; this box was 11 behind), and which
spaces the live tiers have that this box does not. New `npm run local:mirror` walks
**production first, then staging for what production lacks** — `dilijan` was built on
staging and never promoted, so a production-only read called the estate complete while
lacking the space the camp runs on. `docs/ai/local-workflow.md` is the sequence and,
more usefully, what each step does *not* cover: content already on the box is never
refreshed by anything, because every pull path tests existence rather than version.

**Raw's entrance was never the problem; its exit was.** Three changes, in the order they
matter. A local canvas can now **save into its space** (⋯ → "Save to <space>") — the
landing sends every first-time visitor to a browser-only scratchpad, and until now
nothing made there could become a project at all, which made the front door a dead end
by construction. It copies rather than moves, so a failed save cannot cost the work.
The **projector view of a public space is now public** — `/…/raw/projects/{id}/out`
renders for a stranger with no session, while the editor beside it and every surface of
a private space stay gated; "Copy projector link" used to hand an audience a sign-in
card. And a project whose work is a node graph **says so in the public viewer** instead
of publishing as an empty room, offering the live view — an empty grid reads as "the
artist made nothing", which is the opposite of true.

Repairs alongside: `/raw/projects` and `/studio/projects` both rendered "Nothing lives at
raw" (Studio's parser runs first and read the lane name as a space; the order of the
three path parsers IS the routing table). A phone canvas had no exit at all — the
wordmark that leads home was `display:none` under 640px and zen hides the topbar; it
moves to the top-left now with a real finger target. `RawHub`'s "open the Studio node"
409'd in every space after the first, because project ids are a global primary key.
`npm run space:push` refuses a production target it inherited from the environment
rather than one someone named — the root `.env` points at production and `.env.local`
overrides it to staging, so one lost line in an untracked file turned a routine push
live. `ONBOARDING.md` was wrong in four ways, including telling newcomers to set
`REQUIRE_AUTH=false`, which makes every access bug unreproducible.

**MANIFESTO §6 amended** to record decisions the owner had already taken — Studio-as-a-node
merged, "both lanes, ONE UI" chosen, the one-door landing shipped — because the clause
saying the landing must not pick a lane was contradicted by the shipped landing, and a
non-negotiable the product contradicts protects nothing. What was always load-bearing is
untouched: Studio is still the stable shipped surface, and experimental Raw behaviour must
not become its default.

Still the owner's, deliberately untouched: whether a graph should compile into the
published page (the projector view is its public face for now), and the production
deploy moment — wave A and everything above is on staging and local only, while
production still serves the retired three-door landing.

Audit that produced this: https://claude.ai/code/artifact/832266ce-487e-4dcd-b5ee-3283e232a39a
