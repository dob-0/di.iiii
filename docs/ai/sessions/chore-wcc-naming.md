## 2026-09-09 — one word, three jobs: untangling "wcc"

`wcc` named six things at once, and two of them were flatly wrong.

**The genuine ambiguity, which cannot be renamed away.** `/wcc` bare is CODE —
the in-repo microsite mounted from the works registry. `/wcc/<slug>` is DATA —
the `wcc` space's eleven artist projects, served by the ordinary space router.
Both names are load-bearing: the URLs are public and the space id is written
into prod, so neither moves. The seam is now written down in `src/works/works.js`
at the one place both meanings meet, which is where anyone working on either
half actually looks.

**The half that was free to be clearer.** `src/wcc/` → `src/wccSite/`. The
directory is the thing an agent greps first and mistakes for the space; the
suffix says "compiled microsite" without touching a URL.

**Two things named after one exhibition that were never about it.**
`scripts/promote-wcc-projects.mjs` → `promote-space-projects.mjs` (`npm run
space:promote`): it always took `--space` and merely defaulted to `wcc`.
The `wcc-vendor` build chunk → `gsap-vendor`: it holds gsap and nothing else.

**Two things that were simply wrong.** Three docs expanded the acronym as
"World Creative Commons"; the exhibition is **WCC: Women Creating Change**,
which is what every user-facing string in the product has always said.
`vite.config.js` called `public/wcc` "the Alla Virabyan exhibition" — she is
one of the eleven artists, not the exhibition.

**And the document that caused the most drift.** `docs/WCC_MERGE_PLAN.md`
describes `/wcc` as a space's Present → Code view. That is not how the route
works and has not been for a long time. It now opens with a HISTORY banner
pointing at the real mount, so its `isPublic` / `diiEnterExhibition()` history
stays readable without being mistaken for current design.

Nothing changed on screen: no URL, no space id, no user-visible string, no
asset path under `public/wcc/`.
