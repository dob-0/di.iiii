# brand-tool-surfaces — pictures, before and after (2026-10-21)

These were taken on a local stack (`npm run dev`, scratch data), signed in as a throwaway admin, with the
`open` space's one project (`open-jam`) open:
- laptop 1440×900 at DPR 2, and phone 390×844 at DPR 3;
- each with `prefers-color-scheme` light and dark;
- stored at half size, JPEG q72.

`before/` is dev's stylesheets; `after/` is this branch, including the addendum (the owner's rule:
controls square, status dots and drawings round). The `after/` pictures of preferences, raw, jam, scan,
perform, live-project and loading were retaken after the addendum. Workspace, make, space-contents and
webgl-guard were taken before it; the addendum changes nothing those pictures show.

## Counts (from the stylesheets)

| surface | round before → after | % square before → after | 800 weight | 1.5px | box-shadow |
|---|---|---|---|---|---|
| preferences | 1 → 1 | 97.0% → 97.0% (32/33) | 0 → 0 | 0 → 0 | 19 → 12 |
| workspace + panels + inspector | 18 → 2 | 71.2% → 93.5% (72/77) | 0 → 0 | 0 → 0 | 36 → 32 |
| controls + menu (+ base.css) | 2 → 1 | 66.7% → 88.9% (8/9) | 0 → 0 | 0 → 0 | 6 → 6 |
| raw + mobile shell | 1 → 0 | 99.1% → 100.0% (109/109) | 2 → 0 | 1 → 0 | 12 → 12 |
| jam | 2 → 1 | 80.0% → 86.7% (13/15) | 0 → 0 | 0 → 0 | 4 → 4 |
| scan, make, perform + live-project chrome | 17 → 4 | 39.0% → 61.0% (36/59) | 0 → 0 | 5 → 0 | 14 → 14 |
| loading screen + WebGL guard | 2 → 1 | 0.0% → 50.0% (1/2) | 0 → 0 | 0 → 0 | 0 → 0 |

The 10 round sites left are exactly the allowlist in `src/styles/squareCorners.test.js`: seven status dots
and three drawings, each marked "not a control" in its stylesheet. No control is round.

"% square" counts only single values of `0` or `var(--di-radius)`. Per-corner forms such as
`0 var(--di-radius) 0 0` are square too but are not counted. The scan/make/perform remainder is mostly
makeSurface.css's 19 hand-set radii (2–26px), outside this brief's rows.

## What the pictures show, measured

Mean absolute pixel difference, dev vs this branch, dark scheme, on a 0–255 scale:

| page | laptop | phone |
|---|---|---|
| scan | 1.56 | 4.66 |
| preferences | 0.62 | 0.01 |
| perform | 0.07 | 0.46 |
| raw | 0.00 | 0.09 |
| loading | 0.01 | 0.01 |
| every other page | 0.00 | 0.00 |

Most of what changed is **not on screen** in the state these pages open in. These appear only with a second
person, a selection, an open panel or a touch, and none of those states was driven here:
- the joystick, the Fly and altitude buttons, the exit hover;
- the presence dot, the badges, the sliders, the cursor;
- raw's focus outline.

Other notes:
- **Light vs dark:** the largest mean difference between the two schemes is 3.3/255, which is animation and
  3D frame timing. These surfaces have one colour scheme.
- **Workspace:** the legacy editor at `/main` opened with no panels, so its panels and inspector are not pictured.
- **WebGL guard:** forcing a context loss did not bring up the guard, so that picture is not of the guard.
- **Scan:** the shutter is square and its red mark is round (a status dot).
