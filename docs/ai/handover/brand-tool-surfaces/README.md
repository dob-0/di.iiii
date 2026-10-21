# brand-tool-surfaces — pictures, before and after (2026-10-21)

Taken on a local stack (`npm run dev`, scratch data), signed in as a throwaway admin, with the
`open` space's one project (`open-jam`) open. Laptop 1440×900 at DPR 2 and phone 390×844 at DPR 3,
each with `prefers-color-scheme` light and dark. Stored at half size, JPEG q72.
`before/` = dev's stylesheets; `after/` = this branch.

## Counts (from the stylesheets)

| surface | round before → after | % square before → after | 800 weight | 1.5px | box-shadow |
|---|---|---|---|---|---|
| preferences | 1 → 0 | 97.0% → 100.0% (33/33) | 0 → 0 | 0 → 0 | 19 → 12 |
| workspace + panels + inspector | 18 → 0 | 71.2% → 96.1% (74/77) | 0 → 0 | 0 → 0 | 36 → 32 |
| controls + menu (+ base.css) | 2 → 0 | 66.7% → 100.0% (9/9) | 0 → 0 | 0 → 0 | 6 → 6 |
| raw + mobile shell | 1 → 0 | 99.1% → 100.0% (109/109) | 2 → 0 | 1 → 0 | 12 → 12 |
| jam | 2 → 0 | 80.0% → 93.3% (14/15) | 0 → 0 | 0 → 0 | 4 → 4 |
| scan, make, perform + live-project chrome | 17 → 2 | 39.0% → 64.4% (38/59) | 0 → 0 | 5 → 0 | 14 → 14 |
| loading screen + WebGL guard | 2 → 0 | 0.0% → 100.0% (2/2) | 0 → 0 | 0 → 0 | 0 → 0 |

"% square" = border-radius declarations that are 0 or `var(--di-radius)`, out of all of them in those files.
The 2 round sites left are the recording light (Q4). The rest that is not square is makeSurface.css's
19 hand-set radii (2–26px), outside this brief's rows.

## What the pictures show, measured

Mean absolute pixel difference, before vs after, dark scheme, 0–255 scale:
scan 2.22 (laptop) / 3.85 (phone); preferences 0.48 / 0.00; perform 0.03 / 0.39; loading 0.02 / 0.08;
every other surface 0.00–0.01. So in the state these pages open in, most of what changed is **not on
screen**: the jam presence dot, the badges, the status chips, the sliders and the collaboration cursor
appear only with a second person, a selection or an open panel, and none of those states was driven here.

- Light vs dark: the largest mean difference between the two schemes is 3.3/255 (animation and 3D frame
  timing). These surfaces declare one colour scheme, so the two sets are the same page.
- workspace: the legacy editor at `/main` opened with no panels, in navigate and in edit mode; its panels
  and inspector are not in the pictures.
- webgl-guard: forcing a context loss from the page did not bring the guard up; its picture is the
  live-project page, not the guard.
- scan: the recording light (Q4) is round in both sets, as asked.
