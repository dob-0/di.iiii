## 2026-08-23 — the badge that advertised the work by covering it

- Audit item #3. On Beyond Form the "Made with di.iiii — build yours" badge landed squarely on
  the exhibition's own "ԱՇԽԱՏԱՆՔՆԵՐ / WORKS" nav — and because the badge difference-blends, the
  two texts inverted through each other into mush. Neither could be read.
- **Not a placement mistake.** The badge is platform chrome pinned to a fixed corner of a page
  the platform did not author, and the published page is a sandboxed frame the parent cannot
  read (`iframe.contentDocument` is null — checked). There is no way to detect what is under
  the badge and dodge it. Any fixed corner eventually lands on somebody's content.
- So it stops being big enough to cause one: the ◈ mark alone at rest, the whole sentence on
  hover or keyboard focus. 221px → 44px, and the 44 is mostly transparent padding so the tap
  target still clears the minimum. The link, the tooltip and the accessible name are unchanged.
- Expanded, it drops `mix-blend-mode` and brings its own dark ground. Difference-blending is
  right for a 14px mark that has to survive an unknown background and wrong the moment a
  sentence unfolds across someone's text — the first version of this fix expanded into exactly
  the same mush it was meant to end.
- **Owner's decision**, taken with the cost stated: on touch there is no hover, so mobile
  visitors see only the mark. That is reach given up on purpose.

### Worth knowing

- `box-sizing: border-box` is load-bearing here. Without it `min-width: 44px` sits outside the
  12px padding and the mark claims **68px** of an exhibition's corner instead of the 44 it asked
  for — measured, not reasoned.
- The `chrome` variant (inside the live-scene header, where the platform owns the row) is
  deliberately untouched. Only `--floating` is a guest on somebody else's page.
