# feat/network-all-of-us

The network: a page listing everyone who makes di.iiii, and a room per person.

## What it is

`spaces/network/` holds 52 people in `people.json` and generates, from that one
file, the index at `/network` and 52 rooms at `/network/<slug>`. `build.mjs`
writes `code/index.html` (via `index-template.mjs`) and `pages/<slug>.html` plus
one `di-space.<slug>.json` each (via `room-template.mjs`). Both templates share
`lib/css.mjs` and `lib/field.client.js`. Nothing in the space is hand-kept; a
test re-renders every page and compares bytes.

## The rebuild

The first version was built as "b, with elements of a" and delivered that as
adjacency: a white roster column beside a black star panel, sharing a hard
edge. On a phone it stacked into a black block over a white page. The owner
saw it on staging and said so.

What it is now: one sheet of paper. The field is drawn into that paper on a
transparent 2D canvas, masked with a gradient so it dissolves into the right
margin — no second background anywhere, so there is no edge to see. Hovering a
name lights that person's point; a room opens with its person already lit and
lines out to whoever they made something with, which is the same list the page
prints underneath. The dark, turnable version of the field stays as its own
page at `/network/constellation`, where it is the subject rather than a panel.

Four defects behind it are in `docs/ai/known-fixes.md`: the seam, the AA
failures, 229 KB of three.js for 52 dots, and a room's own person rendering
inside the masked half.

## Decisions worth keeping

- **No per-row numbers.** A numbered list of named artists reads as a ranking
  of them. Sections carry the structure and their own counts; inside a section
  the order is alphabetical, which says plainly that it is not a ranking. Team
  keeps its declared order — it is a masthead.
- **The list drives the field, never the reverse.** The canvas is
  `pointer-events: none`. It cannot steal a scroll or a tap, and the roster is
  the only interface on the page.
- **Every number in the copy is generated.** "Fifty-two people make di.iiii —
  five run it, forty-seven make with it" comes from `people.json`. The hand-
  typed version had already drifted.
- **Two accent tokens.** `--accent` (#0097a3) draws marks; `--accent-ink`
  (#00757f) carries text. The brand cyan #4DF9FF is the light-on-dark form and
  fails as type on paper.
- **On a phone the diagram's lines are dropped** — there is no margin to draw
  them in, so they would cross the names. Only the dust of the points remains.

## Open

- `/network/the-index` still holds the earlier stand-alone roster page, now
  superseded by the index itself. It is unlinked but reachable. Retire it or
  fold it in.
- Prod holds 9 of the 55 network projects. Promoting needs the code first, then
  `space-sync --all --tier prod`, then the owner's word.
- No portraits exist for anyone on this machine. One image per row is the thing
  that would turn a directory into a portrait, and it is the same data.
