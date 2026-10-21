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
| laptop editor | 6 of 133 round, 95.5 % square (switch track, switch thumb, presence dot, sync dot) | 2 of 133, 98.5 % square (the two status dots, kept by the owner's decision) |
| phone editor | 3 of 26, 88.5 % square (the three top buttons) | 0 of 26, 100 % |
| constellation (laptop and phone) | 5 of 19, 73.7 % square (the legend marks) | 0 of 19, 100 % |

**In the source:** round radii in `studio.css`, `studio-help.css`, `studio-mobile.css`,
`space-constellation.css`: 15 → 2 (`.scc-sync-dot`, `.scc-presence-dot`, each marked "status dot, not a control"). Controls now have 0 px corners; non-control marks (help diagrams, legend keys) take `var(--di-radius)`. Lines holding a retired colour
(`#4fd6ff`, `#7fc4e8`, `#53d79b`, `#0a1118`, `#0f1722`, hex or rgb) under `src/studio` and
`src/project/viewport`: 31 → 0. `!important` in `studio.css`: 18 → 8.

**The scene is unchanged:** a viewport region no panel covers (laptop 410×790 CSS px, phone
390×500), before vs after: 0.000 % of channels differ by more than 8, largest difference 0,
on all four (laptop/phone × dark/light). Measured on uncompressed shots, re-taken after the
addendum; the committed PNGs are palette-compressed, which alone puts 0.1–1.4 % dithering
noise on gradients, so do not re-measure from them.

**Slider** (WCAG 2.2 SC 2.5.8, 1.4.11), measured on the pictures:

| | before | after |
|---|---|---|
| hit box (the input element) | 274 × 4 px — fails 24 × 24 | 274 × 24 px |
| thumb | 13 × 13 circle | 8 × 18 rectangle, 0 px corners, 2 px dark rim |
| thumb edge vs the filled cyan line | 1.82 : 1 — fails 3 : 1 | 13.28 : 1 |
| thumb vs the empty line / the ground | 12.77 / 15.71 : 1 | 12.77 / 15.71 : 1 |

**Switch:** hit box (the label) 274 × 24.2 px before and after. Thumb 10 × 10 and track, circle and pill → 0 px corners.
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
- The recording light: none of the four files draws one. Owner's decision (relayed 2026-10-21): the two status dots stay round.
- Not touched: `src/algoVrithm`, the constellation's own scene background `#05080d`,
  the landing hover (Q1), the tagline (Q2).

## Addendum (two audits + owner decisions, relayed 2026-10-21)

Pictures: `before-2/` (`dev`, true before) and `after-2/`: `/spaces` grid, list with a
keyboard-focused row, map; the Studio's Code view with no code; the controls close-up.
Numbers in their `numbers.json`.

| | before (`dev`) | after |
|---|---|---|
| switch thumb / track corners | 50 % / 999 px | 0 / 0 |
| presence dot, sync dot | round | round (status dots, not controls) |
| list row, keyboard focus fill | cyan α 0.0005 (none) | cyan α 0.05 |
| `.scon-prow--live` fill | `color-mix 0.06%` | `var(--di-cyan-wash)` (the ladder's 0.06 step) |
| space card rest fill | white 0.03 | `var(--di-cyan-wash)` (cyan 0.06) |
| space card hover / focus fill | cyan 4 % | `var(--di-cyan-dim)` (0.10), so hover stays above rest |
| live address `.ssh-live-url` | `--di-success` green `rgb(77,249,192)` | `--di-text-muted` (white 0.5); the LIVE badge stays green |
| view toggle transition | `all 0.18s` | `background-color, color 0.18s` |
| map label fade, panel slide | 0.25 s, 0.22 s | 0.2 s, 0.2 s |
| Studio Code view message card | 18 px corners | 2 px (`var(--di-radius)`) |

- `.scon-sat-label`'s black text-shadow stays, with its reason in a comment.
- `PresentationCanvas.css` (V1 editor's Code View empty card): 24 px / 20 px → `var(--di-radius)`,
  warm drop shadow removed. Not seen on screen: it lives in the V1 editor, which I did not route to.
  Its white card `rgba(255,255,255,0.84)` and brown ink `#23180a`, `#8a6a2b`, `#5f4930` are off
  the ladder: listed, not changed.
- `src/utils/presentationTemplates.js:547` (`.card` 28 px): inside a starter template's HTML,
  i.e. the artist's content, not the frame. Listed, not changed.
- `StudioViewport.jsx` still draws the project's default ground `#0a1118`; it reads it from
  `defaultWorldState` (a hex in the shared schema), not a `var()`, so `THREE.Color` gets the hex.
- Not mine (per the audit): navy glass, glows, low-contrast text.
