## 2026-09-10 — every WCC version we could actually recover, and the one we couldn't

Asked: recreate every version of the WCC exhibition that ever existed as draft
projects in the `wcc` space on the owner's **local** tier, so he can open them
side by side. Two were already done by an earlier pass and left untouched:
`emily-v1-framed-entry` (commit `5a644003`) and `emily-v2-arc-of-panels`
(commit `2b376577`).

### Mid-session correction

The owner rejected the four leads in the original brief ("no all you find
nothing") and pointed at a specific memory instead: **rooms, plural**, pulled
from Emily's PRs, seen once on staging, gone afterward. That became the
priority; the dob-0 renderer and the open-ended git timeline sweep dropped to
secondary/abandoned. This note follows that order.

### The rooms lead — exhaustively checked, not found

Read every one of Emily's PRs on `dob-0/di.iiii`: #13–24, #88, #89, #180,
#254, #310, #367, plus #373 (which harvested platform fixes out of her two
open PRs #254/#180 — fonts and a golden rule; nothing WCC, nothing room-shaped
left behind). None of them, in title, body, diff or changed-file list, name a
multi-room WCC layout beyond what's already captured as `emily-v2`.

The strongest candidate was **#310 `feat/scene-room-controls`**, merged
2026-09-02, four commits: per-space walk-mode fog, confining walk mode to an
authored floor plan, proximity-triggered entity lights, honouring
`gridVisible`. Confirmed via `gh run list` that its merge commit
(`aeac7eeffc`) deployed to staging successfully at **2026-09-02T18:53:41Z** —
so if the owner was on staging that evening, this is what went live under
him.

But the capability and the data are different things, and the data never
caught up:

- Walked **every project, on every space, on all three tiers** (local,
  staging, prod) checking for a non-null `worldState.fog`, a non-null
  `worldState.walkableAreas`, or any entity `components.proximity`. Real hits
  exist — `main/main-dii-project`, `open/front-room(-light)`, `open/open-jam`,
  `cascade/club`, `dilijan/room-1..5`, `open/look-*` — but **zero** are in
  `wcc`, and every dilijan room predates 2026-09-02 by a week or more (ruling
  out "he actually meant dilijan").
- `wcc/main`'s op log on staging has recorded **nothing since 2026-08-06**;
  on local it was wholesale-replaced at 2026-09-02T04:12 UTC, *before* #310
  even merged that evening, so that replace can't be the "death" either. All
  four `replaceDocument` snapshots retained from staging's 2026-08-06 cluster
  (versions 1934–1937) carry the same 20 open-ring entities as today, no
  fog/walkableAreas fields at all (the schema didn't have them yet).
- `/api/trash` is empty on both local and staging (30-day TTL, well inside
  the 2026-09-02 window) — nothing WCC was soft-deleted and is waiting to
  expire.
- The word "room" does not appear anywhere in the entire git history of
  `src/wcc/`, `src/wccSite/`, or `public/wcc/` — not once, in any commit.
- Checked Emily's fork directly (`emilyhttps/*` refs) for anything not
  upstreamed: her `dev` is byte-identical to `origin/dev` (0 unique commits);
  `cpanel-production`/`cpanel-staging` are prebuilt-bundle commits from
  2026-06-17/18, before the exhibition scene file even existed.

**Conclusion, stated plainly: nothing recoverable survives.** The most
consistent explanation is that someone (plausibly showing off #310 the
evening it shipped) applied fog/floor-plan confinement live, in the Studio
editor, to the WCC hub or an artist zone — visually turning the open ring
into something that reads as separate enclosed rooms — and never saved it.
That would explain every symptom: seen once on staging, gone after, no git
trace (never went through code), no op-log trace (never written), nothing in
trash (never existed as a project to delete). No project was invented for
this lead; there is nothing real to build it from.

### Kept from the original brief (secondary, but done)

**Prod's white `main`, copied down as its own draft** —
`main-prod-white-variant`. Fetched prod's live `main` document with
`PROD_API_TOKEN`, confirmed the exact 18-leaf diff against local/staging's
black `main` named in the brief (`backgroundColor` `#ffffff` vs `#000000`;
`zone-arthur`, `zone-ani-khachatryan`, `zone-mery-petrosyan`,
`zone-meri-andreasyan`, `zone-yeva-abgaryan` moved; `zone-nush-petrosyan`
`animation.mode` `static` vs `float`), then PUT the untouched prod document
into a brand-new local project and set it to `draft`. No assets referenced
(portal-only document), nothing to transfer.

**Any earlier state of `main` still recoverable** — checked and confirmed
nothing is. Local's op log holds 2 ops (both `replaceDocument`, 2026-08-05
and 2026-09-02). Staging's holds 500 ops spanning 2026-07-07→08-06. Prod's
holds 49 ops spanning 2026-08-20→21 (consistent with a project-copy having
reset its version counter around then, matching "authored directly on prod
08-20/21" from the brief). The earliest full document staging can still
reconstruct (`replaceDocument` at version 1934, 2026-08-06 05:36) is
content-identical to today's live `main` — the only diffs are schema fields
added by later `normalizeProjectDocument` versions, not authored changes.
`spaceStore.js`'s snapshot mechanism only archives idle sandboxes / the open
space, not `wcc`. Nothing earlier exists to recreate.

**dob-0's grown renderer** (from the original brief, now secondary since the
owner's memory points elsewhere — kept because it's real and fully
documented). `src/wcc/scene/WccExhibition.jsx` peaked at **1150 lines**,
commit `38bfe462` (dob-0, 2026-06-28), before being deleted the next day in
`71e7196a` ("the exhibition renders through LiveProjectScene now"). Recreated
as `dob0-hub-and-ring`: the central beacon ring (`HubMarker`, innerRadius 3.6/
outerRadius 4.2), the bilingual billboard title crown at y=8.4 in its three
sizes/colours, and the ten artist zones as `portal`/`embed` entities in a
38m ring, each pulling in that artist's real live content in place — the
closest available primitive to what `ZoneGroup` actually did (fetch each
artist's doc, render it at its ring position). `worldState.spawn` matches
the source's own default player pose (`x:0 z:0 yaw:0 pitch:1.3 altY:1.6`,
looking up at the title), background `#0a1118`, fog near 10/far 110.

**Did not survive translation** (named, not faked, per the brief):
- The ambient particle field (1400 points, ring-distributed, slow rotation) —
  no particle primitive in the schema.
- The ten thin hub-to-portal spoke lines — no line entity type.
- `AtmosphereBlender` — the whole-scene background/light lerp driven by
  inverse-distance-weighting every zone's own `worldState`, live, every
  frame — schema has one `worldState` per project, not a blend function.
- Fly mode, the VR/AR thumbstick locomotion, the mobile floating joystick,
  the animated first-visit movement hint, and the top progress bar — all
  interaction/UI, not geometry; nothing to place.
- The hub's own contents as they stood on 2026-06-28 — `WccExhibition.jsx`
  rendered whatever the live `main` project held at hub center, but `main` is
  a living document with no historical record before 2026-07-07 (staging's
  earliest retained op) — six-plus weeks after this renderer existed. Not
  recoverable at any tier; not invented.

### A duplicate found mid-session

Partway through, `wcc` already held `dob0-hub-portal-ring` and
`prod-main-white-variant` — near-identical projects to the two above (same
approach: portal/embed ring, same prod-diff copy), created within ~30–100
seconds of mine by some other process working the same brief concurrently.
Left both pairs in place rather than deleting someone else's fresh work
blind; the owner or a follow-up pass should pick one of each pair and trash
the other before this is genuinely ready to browse side by side.

### Verify

`npm run lint` / `npm run build` / `npm run test` / `npm run docs:ai:check` —
no repo code changed this session, only this note; all four pass. Every
project this session made was screenshotted headless (unauthenticated,
1440×900 @2x) against `https://local.thedi.studio/wcc/<id>` and looked at:
`dob0-hub-and-ring` reads as clearly distinct from both existing Emily
versions (open ring of live artist content around a lit hub, not a fixed
framed shot or three arced panels); `main-prod-white-variant` reads as
clearly distinct from the live black `main` (white void, black/red beacon,
same artist content) — not a near-duplicate of anything else in the space.
`assets:audit --space wcc` — every referenced asset present on every project,
including the two made this session.
