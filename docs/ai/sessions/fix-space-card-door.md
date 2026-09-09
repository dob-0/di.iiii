# 2026-09-10 — a space card's door opens the space

On `/spaces` the WCC Exhibition card led nowhere useful. Its picture, its live
frame and its Live link were all built with `buildAppSpacePath('wcc')` — the
bare segment — and `/wcc` bare is not the space. It is a WORK: the coded
microsite in `src/wccSite/`, mounted by `src/works/routes.jsx`, with no rows in
any database. `RootApp.jsx`'s `isWorkSurface` branch resolves a one-segment path
to the work before the space router is ever reached, so the card could only ever
land on the piece.

The `wcc` SPACE is real — eleven projects, `main` plus ten artists — and it
answers at `/wcc/main`, `/wcc/mery-petrosyan` and so on. `src/works/works.js`
states this two-meanings problem in its own header; nothing had acted on it.

**What it cost, per tier.** On the owner's offline install `DI_PROFILE=local`
replaces every work with `HostedPieceStub` and omits `public/wcc/` (25 MB), so
the card drew "not in this copy — this piece lives on di-studio.xyz" over a
space whose eleven projects were sitting in that very machine's database. He had
no door to them from `/spaces` at all: `/wcc/main` renders perfectly, but only
if you type it. On staging and prod the card opened the coded landing and the
space's own `publishedProjectId` was never honoured.

## The seam

`buildSpaceDoorPath(space)` in `src/works/segments.js` — the works-boundary
module, which already answers "which work owns this segment" and is the only
sane place to ask "so where does the space go instead". Where a work shadows the
id AND the space declares a `publishedProjectId`, the card addresses
`/{space}/p/{projectId}`.

- **The `/p/` form, not the vanity one.** `publishedProjectId` is a raw id, so
  no resolve step is needed — and three segments is past `isWorkSurface` by
  construction, which is what makes the door work at all.
- **Nothing names a work.** The registry answers; `src/works/boundary.test.js`
  keeps it that way. `algovrithm` is shadowed too, and gets the same treatment
  the moment it publishes a project — today it declares none, so its card is
  untouched.
- **Every other space is exactly where it was.** The bare path is already its
  door; the helper returns it unchanged.
- **The stub keeps the case it was written for.** A shadowed space with nothing
  published still falls back to the bare path, which is where "not in this copy"
  belongs: a work's own page on an install that left the work out.
- **`/wcc` bare is untouched.** The exhibition landing still serves there on the
  hosted tiers. Only the CARD's door moved.

Four call sites: the thumbnail, the made-live frame, that frame's Open ↗, and
the list row's Live — plus `openCard`, which is the card's primary door for a
visitor who cannot edit the space.

## The guard

`src/works/segments.test.js` (five cases, ids taken from `WORKS` so a renamed
work moves the test with it) and two cases in `SpaceHub.test.jsx`. Watched them
fail against the pre-fix source: `expected '/wcc?preview=1' to be
'/wcc/p/linked-project?preview=1'` and `expected '/wcc' to be
'/wcc/p/linked-project'`.

## Seen, not assumed

Packed `0.4.9-door.1`, installed it on the local tier, and opened
`https://local.thedi.studio/spaces` headless at 1440x900, DPR 2:

- the WCC card's thumbnail, its live frame and its Live link all read
  `/wcc/p/main`;
- the card paints the exhibition floor — the works and the artists' names —
  where it used to draw the stub line;
- `/wcc/p/main` opens WOMEN CREATING CHANGE with all ten artists;
- nine other cards still read `/{space}?preview=1`, and the list's other Live
  links still read `/{space}`.

Screenshots opened, not merely saved.

## Not fixed

The card's copyable live URL (`getSpaceShareUrl`, the `https://…/wcc` line with
the Copy button) still shows the bare address. On the hosted tiers that is
arguably the right thing to hand out — `/wcc` IS the exhibition's public address
— but on an offline install it now disagrees with the card's own buttons. The
owner's call.
