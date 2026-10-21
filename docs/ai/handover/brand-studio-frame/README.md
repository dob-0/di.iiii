# The Studio's frame is di.iiii's — before / after (2026-10-21)

Owner's rule: the frame is di.iiii's; a project's scene and its own colours inside the
viewport stay as they are. Branch `claude/brand-studio-frame-u4jb6r`, waiting for the owner's look.

How these were taken: a local stack from this branch (`npm run dev`, Vite :5173,
serverXR :4000 on a scratch `DATA_ROOT`), signed in as a driver account, headless Chromium
1194 with SwiftShader. One project made for the purpose, `main/frame-look` (a box, a sphere,
a torus; the torus selected on the laptop). `before/` is `dev` at `d573cd8` (the change
stashed), `after/` is this branch; same project, same camera, same account.

| picture | laptop 1440×900 @2 | phone 390×844 @3 |
|---|---|---|
| Studio with the project open | `*/laptop-{dark,light}-editor.png` | `*/phone-{dark,light}-editor.png` |
| Spaces constellation (MAP) | `*/laptop-{dark,light}-constellation.png` | `*/phone-{dark,light}-constellation.png` |
| Slider + switch close-up (a copy of the panel's slider at 50 %, the switch off and on) | `*/laptop-{dark,light}-controls-closeup.png` | — |
| Code window (the Studio's MUI buttons, for the `!important` removal) | `*/laptop-{dark,light}-code-window.png` | — |

## Numbers (from `before/numbers.json`, `after/numbers.json`)

**Round sites on screen** (visible elements outside the canvas that draw a border or a fill,
and how many have any corner above 2 px):

| view | before | after |
|---|---|---|
| laptop editor | 6 of 133 round, 95.5 % square (switch track, switch thumb, presence dot, sync dot) | 1 of 133, 99.2 % square (the sync status light, kept) |
| phone editor | 3 of 26, 88.5 % square (the three top buttons) | 0 of 26, 100 % |
| constellation (laptop and phone) | 5 of 19, 73.7 % square (the legend marks) | 0 of 19, 100 % |

**In the source:** round radii in `studio.css`, `studio-help.css`, `studio-mobile.css`,
`space-constellation.css`: 15 → 1 (`.scc-sync-dot`). Lines holding a retired colour
(`#4fd6ff`, `#7fc4e8`, `#53d79b`, `#0a1118`, `#0f1722`, hex or rgb) under `src/studio` and
`src/project/viewport`: 31 → 0. `!important` in `studio.css`: 18 → 8.

**The scene is unchanged:** a viewport region no panel covers (laptop 410×790 CSS px, phone
390×500), before vs after: 0.000 % of channels differ by more than 8, largest difference 0,
on all four (laptop/phone × dark/light).

**Slider** (WCAG 2.2 SC 2.5.8, 1.4.11), measured on the pictures:

| | before | after |
|---|---|---|
| hit box (the input element) | 274 × 4 px — fails 24 × 24 | 274 × 24 px |
| thumb | 13 × 13 circle | 8 × 18 rectangle, 2 px dark rim |
| thumb edge vs the filled cyan line | 1.82 : 1 — fails 3 : 1 | 13.28 : 1 |
| thumb vs the empty line / the ground | 12.77 / 15.71 : 1 | 12.77 / 15.71 : 1 |

**Switch:** hit box (the label) 274 × 24.2 px before and after. Thumb 10 × 10, circle → square.
Off: thumb vs track 4.35 : 1, vs ground 5.35 : 1. On: 9.92 : 1 and 15.71 : 1 (before 9.93 / 15.71).

**M29, the constellation's view toggle:** the lit button's fill measured
`rgba(77,249,255, 0.0014)` before (invisible: `0.14%` written for 14 %) and `0.14` after.

**The `!important` that only fought the old theme.** Each of the 18 was flipped in the
running page and the computed value of every element it matched compared (Code window open:
7 MUI buttons, one disabled, 3 outlined papers; at rest and with an outlined button hovered),
in the Vite dev server and again in a production build (`vite preview`, where emotion's
order differs). The 10 on `.sfp-content .MuiButton-*` / `.MuiPaper-outlined` changed nothing
on screen and are gone. Kept: `border` on contained buttons (without it: `solid → none`), and
the 7 on `.insp-delete-btn`, which fight `.scc-btn`, not the theme.

## Light and dark

The Studio has no light colour scheme (`base.css` and the Studio stylesheets have no
`prefers-color-scheme` rule; the MUI theme is `mode: 'dark'`). The light pictures were taken
with `colorScheme: 'light'` and are the same as the dark ones: 0.000 % of channels differ on
editor, code window and close-up; 0.04–0.24 % on the constellation, which is its breathing glow.

## What changes for the eye (LOOK)

- The MAP / LIST / GRID toggle and the arrange / filter buttons show their "on" fill (M29).
- A public space on the constellation is `#32999d` (house cyan at 60 % on the ground) instead
  of pale blue `#7fc4e8`: darker than it was.
- Help diagrams (orbit, ring, camera dot, step numbers) are rectangles now — the brief asked
  for every round site in `studio-help.css`; the orbit picture is a rectangle, not an ellipse.
- Sliders are 8 px taller per row (24 px hit box instead of 4 px + 12 px margins).

## Not seen / not done

- The dev tier (dev.diiii.xyz) did not answer from this sandbox; nothing here is from it.
- The scene's floating name label ("Torus") draws over the Objects panel on the laptop, before
  and after — not this change; not fixed.
- The recording light: none of the four files draws one. The sync status dot is kept round with
  it until the owner answers Q4.
- Not touched: `src/algoVrithm`, the constellation's own scene background `#05080d`,
  the landing hover (Q1), the tagline (Q2).
