## 2026-09-01 — the 2D landing, measured against the room it now stands in

Branch off `feat/landing-in-3d`, not `dev`: this is the 2D pass that branch left open.

- **The order the page now has, and why.** The owner's read was "only Step inside is
  highlighted… there are some mess", and the audit agreed for a reason he could see but
  not name: the page had SHOUT (the wordmark, the door, four heavy space chips) and
  WHISPER (everything else) and nothing between them. Five tiers now: (1) the wordmark
  and the one lit door; (2) the tagline, which is the whole pitch and was set in footer
  grey; (3) **the four public spaces, named as a group** — the visit is the product, so a
  stranger's fastest route to understanding is to go and look at one; (4) the ways back —
  Spaces / Wiki / GitHub / Open Studio, legible rather than faint; (5) the scroll hint.
  The one door stays one door: the 2026-08-18 pass that reduced three peer buttons to one
  is not reopened, because two of those three led somewhere worse.
- **The contrast was not a scrim that needed nudging.** Sampled off a real screenshot with
  the copy hidden: the average backdrop under the tagline is rgb(28,32,121), but the peak
  is a pale door ring at **rgb(144,153,153)**, over which even pure white is 2.9:1. The
  shipped copy measured **2.78:1** there. A flat scrim cannot fix that — dark enough for
  the ring puts the room out. So the darkening is local: a radial reading veil over the
  copy column (`--lp-hero-veil`), a much lighter vertical wash (`--lp-hero-wash`), and the
  outer thirds keep the room's own light. Both are custom properties because
  `src/styles/contrast.test.js` now reads them, composites them over the measured ring,
  and asks the AA question where the visitor actually stands — the old guard measured
  against the theme's black, which the hero stopped standing on the day #283 landed.
- **The 390px pile-up was MUI, not wrapping.** `<Stack spacing={n}>` compiles to
  `margin-left` and nothing else, so a wrapping row gets zero vertical separation AND
  every line after the first pushed right by the same margin — a row set to justify centre
  that is not centred. Real flex `gap`, margins off. Latent in every wrapping MUI Stack
  in this codebase.
- **Two things nobody had looked for.** Tabbing the live page: no visible focus ring
  anywhere, and *nothing at all* on the door and the four spaces, because MUI ButtonBase
  sets `outline: 0`. And tabbing during a 6-second flight: **nine invisible tab stops**
  inside the CSS3D clones — `.lp-in-space *{pointer-events:none}` speaks only to the
  mouse. The clones are `aria-hidden` + `inert` now, with an explicit `tabIndex = -1`
  sweep because `inert` does not exist in jsdom or before Chromium 102.
- **One copy fix.** `br_id_ge · live at Notations #2` — the show closed 2026-08-02 and the
  front door had been announcing it as live for a month, on prod. It says `br_id_ge` now,
  like the other three. The owner can overrule this in one line.
- **The four chips are one set with four identities**, not four stickers: one shape, one
  border weight, one type colour, and each space's own colour as the mark in front of its
  name. That is also the only version of the row that survives becoming a grid of every
  public space. They stay four separate `<a>` elements with their stable class hooks and
  unchanged boxes — the mark is a `::before` — because the spaces unfold will measure each
  one with `getBoundingClientRect()` and lift it the way `enterFlight.js` lifts the hero.
  `lp-nav-spaces` added to the nav link for the same reason.
- **HARD 1 honoured**: `.lp-space-row-label` added to `LIFTABLE` at depth −30, beside the
  row it names. Nine layers lift now (was eight), verified on a live `?flight=6000`.
- Guards, each watched failing first: two in `contrast.test.js` (2.78:1 and 3.99:1 at the
  shipped values), four in the new `heroRows.test.js`, one in `pageInSpace.test.js`.
- **Verified by looking**, 1440×900 DPR2 and 390×844 DPR3: resting page top to bottom,
  the flight at 600ms and 1800ms, the focus ring on the door and on a space chip, and the
  tab order and mid-flight focus read out of the live DOM rather than assumed.

### Left open

- MUI's TouchRipple draws a grey blob inside a focused space chip. It is MUI's own focus
  feedback and was simply invisible under the old solid fill. Untouched.
- `.lp-eyebrow` and `.lp-enter-note` are still whispers by design; both clear AA.
- The spaces unfold itself is deliberately not built here.
