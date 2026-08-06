---
name: ui-overlap-stress-test
description: 'Find and fix sibling-element overlap in a di.iiii toolbar/header — elements that never escape the viewport but collide with each other, a class verify-surfaces.mjs does not check. Use when a screenshot shows overlapping text/buttons, before shipping a toolbar/header layout change, or when asked to stress-test a UI surface across widths.'
argument-hint: 'Name the surface (e.g. "Raw topbar") or paste the overlap screenshot'
---

# UI Overlap Stress Test

## When to Use

- A screenshot (from the user or `verify:surfaces`) shows text/controls overlapping.
- Before shipping any change to a toolbar, header, or other flex row that mixes
  fixed-width controls with unbounded-width text/labels.
- The surface has more than one *dynamic* content state in the same slot (e.g. Raw's topbar
  center swaps between a hint pill and a breadcrumb trail depending on nav depth) — each
  state needs testing, not just whichever one happened to be on screen when the bug was seen.

## Outcome

Every sibling in the toolbar/header row stays clear of every other sibling at every width
from phone (390px) to desktop, across every dynamic content state the flexible slot can hold
— verified by a script that measures real boxes, not just eyeballed at the one width the bug
report happened to show.

## The One Rule That Matters

`npm run verify:surfaces` checks whether anything escapes the *viewport*. It does not check
whether two sibling elements' boxes intersect *each other* while both stay inside it — a
center-flex hint pill with no `min-width:0`/ellipsis colliding with a fixed-width button
cluster is invisible to that check. This class shipped unseen in Raw's topbar (2026-08-06):
`.raw-topbar-location` had `white-space: nowrap` and no max-width, so at ~890px it painted
straight through the `Help` button instead of truncating.

## Procedure

1. **Find the container and its direct children.** Identify the flex/grid parent and the
   sibling boxes that must never collide (e.g. `.raw-topbar-left/-center/-right`).
2. **Find every dynamic state of the flexible slot**, not just the one in the report. Grep
   the component for what renders in that slot — ternaries, `&&` branches — each is a
   separate case to test (hint pill vs. breadcrumb; empty vs. long workspace name; etc).
3. **Run the checker**, seeding real content first so the surface isn't in its empty state:
   ```
   node scripts/check-toolbar-overlap.mjs --route /open/raw \
     --container .raw-topbar --children ".raw-topbar-left,.raw-topbar-center,.raw-topbar-right" \
     --widths 1440,900,889,700,390
   ```
   It fails non-zero and names the exact width + child pair on any pairwise bounding-box
   intersection. Adjust `--route`/`--children` for a different surface.
4. **Root-cause, don't just truncate the one string that overlapped.** Check for, on the
   flexible/text child: `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`,
   `flex-shrink` not `0`. Check for, on the fixed side: whether it should shrink too at some
   width, or move into an overflow menu instead (see the existing `900px`/`700px` breakpoints
   in `src/raw/styles/raw.css` for the established pattern of progressively hiding
   least-essential controls before anything truncates unreadably).
5. **Re-run the checker across the full width range** (desktop → 390px phone), for *every*
   dynamic state found in step 2 — not just the width and state from the original report.
6. **Look at the actual screenshots**, not just the pass/fail line — an ellipsis can still
   read as "broken" if it clips mid-glyph or leaves an orphaned single character.
7. Record the bug in `docs/ai/known-fixes.md` and add the specific `--route`/`--children`
   invocation to the nearest `AGENTS.md`'s Validation section so the next change to that
   surface runs it automatically.

## Validation

```bash
node scripts/check-toolbar-overlap.mjs --route <route> --children "<selector list>"
npm run test
npm run lint
```

Exit code is non-zero if any tested width shows a sibling overlap — treat it like any other
failing gate, not advisory output.

## Completion Checks

- `node scripts/check-toolbar-overlap.mjs` exits 0 for every dynamic content state of the
  surface, at 1440/900/889/700/390px (or the surface's own relevant breakpoints).
- Screenshots opened and read, not just the exit code.
- `known-fixes.md` entry + the surface's `AGENTS.md` validation list updated.
