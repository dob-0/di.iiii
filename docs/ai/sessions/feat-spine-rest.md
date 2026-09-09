## 2026-09-10 — the spine over every platform stylesheet

The spine landed earlier the same day covering **4** stylesheets, and the debt
list named five more. Both numbers flattered the truth: `src/` holds 56
stylesheets and carried roughly **1,500** violations, 522 of them in `raw.css`
alone. This pass finishes it.

`base.css` grew only what conversion needed and could not invent:

- the brand colours as channel triples — `--di-cyan-rgb`, `--di-danger-rgb`,
  `--di-success-rgb`, `--di-warning-rgb` — so a surface picks its own alpha
  without writing the colour's numbers by hand. `studio.css` alone had
  seventeen different cyan alphas, each one a place a palette change would
  miss. `rgba(var(--di-cyan-rgb), .2)` is the sanctioned form.
- `--di-scrim` / `--di-scrim-strong`: the dark veil laid over a live room or a
  3D background so text on it stays readable. It existed as five different
  hand-picked near-blacks — `rgba(3,7,14,.74)` on the wiki, `rgba(4,6,14,.74)`
  on the landing, `rgba(4,6,9,.9)` in Studio — the same intention, three
  colours.
- `--di-success-rgb` is the success token's own channels. The first draft used
  a different green and would have made the triple lie about its own name.

**46 stylesheets converted and locked; `NOT_YET` is empty.** What the conversion
turned up: a second blue/teal/green palette living inside the inspector and the
controls (`#00c6ff`, `#5ce3b3`, `#4ade80`, gradient buttons) next to a flat cyan
platform; nine corner radiuses; three mono stacks.

**Two written exceptions, in `BY_DESIGN` with the reason spelled out** — a
surface that deliberately is not the dark chrome is a decision somebody made,
and it has to be recorded or the next pass "fixes" it back:

- `PresentationCanvas.css` — the presented page is paper. Cream ground, brown
  ink, and the dark chrome around it is the frame, not the picture. Its two
  floating toasts are platform chrome and were converted.
- `make/makeSurface.css` — paper too, and bilingual. `--di-sans` carries no
  Armenian glyphs, so rule 3 would drop every Armenian word on the kid-facing
  toybox to whatever the phone happens to have; and line 578 of that file
  records the device test where `--di-cyan` on a cream sheet meant a child
  could not see there was a second room to tap. It joins the spine the day
  `base.css` grows a light half and either an Armenian face inside `--di-sans`
  or a sanctioned `--di-sans-hy`.

Fixed on the way:

- **Five Raw panel labels were invisible** — `var(--di-cyan-dim, #9fd7ff)` as a
  text colour, where the token is declared as the accent at 0.1 alpha, so the
  fallback never fired and the labels rendered at 10% cyan on near-black.
- `spine.test.js` rejected 13 lines whose values were already correct, because
  they carry `!important` to beat MUI's injected `MuiButtonBase` styles. The
  test was wrong, not the CSS.
- `contrast.test.js` demanded a literal `rgba` in `landing.css`, which "use the
  token" had just made impossible. It follows the token into `base.css` now, so
  both guards can be true at once.
- five `--workspace-*` tokens nothing reads.

**Seen, not assumed.** Packed as `0.4.8-spine.1`, installed on the local tier,
and walked at 1440x900 DPR 2 and at phone width: the Spaces home, `/wiki`,
`/tools`, `/raw` with a graph built, the Studio editor with Create, Objects and
an object's inspector open, admin, a walked room, and the lighting desk. Each
one shot against staging's pre-spine build in the same viewport — the pairs are
visually identical, which is the result you want from a pass that was meant to
change what the CSS *says*, not what it draws.

One thing seen and NOT caused here: the lighting desk's header collides at
1440px — "Blackout" sits over the title and the `output off` badge over
"Art-Net Desk". That desk keeps its own stylesheet by decision and was not part
of this pass.
