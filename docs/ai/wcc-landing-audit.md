# WCC Landing Page — Layout & Scroll Audit

Reference for anyone fixing `src/wcc/landing/LandingPage.jsx` + `landing.css`. Written after a
session of whack-a-mole on the "dead gap" + scroll bugs — the goal here is to make the next fix
a 5-minute change instead of a guess-and-screenshot loop.

## Architecture (scroll model)

The page is **not** window-scrolled. It scrolls inside a custom element:

```
.wcc-landing          root scroller — height:100vh; overflow-y:auto   ← THE scroller
├── .wcc-hero               min-height:100vh; align-content: end (center ≤1100h)
└── .wcc-horizontal-wrapper height: calc(100vh + travel*2)   ← drives the pinned scrub
    └── .wcc-horizontal     height:100vh; overflow:hidden     ← the visible "window"
        └── .wcc-panel-track  flex; min-height:100vh; align-items:center
            └── .wcc-nav-panel  height: min(82vh, 820px)  ← the 01/02/03 cards
```

A GSAP **ScrollTrigger** (in `HorizontalNavigation`) scrubs `.wcc-panel-track` horizontally
(`x: 0 → -travel`) as you scroll the wrapper. `travel = track.scrollWidth - viewportWidth`.
Mobile (`max-width: 800px`) drops the horizontal pin entirely and stacks panels vertically.

## Gotchas already fixed (don't reintroduce)

1. **ScrollTrigger must bind to the custom scroller.** `scroller: scrollerRef.current` is read once
   at creation; if the ref is null at that moment (lazy/Suspense in the **prod build**), GSAP
   silently falls back to `window` → the track freezes (window never scrolls here). Fixed by
   gating creation on `scrollerReady` + re-running. **Always test the production build**
   (`npm run build && vite preview`), not the dev server — StrictMode's remount masks this.
2. **Stale measurements.** `travel()` is measured at layout time; refresh on `fonts.ready`/`load`.
3. **Verify with real scroll across viewports:** `npm run check:responsive <url> --scroll`.

## The "dead gap" (current open item)

**Symptom:** between the hero CTA and the first panel card there's a large empty red band,
worst on tall/portrait windows.

**Root cause — it's structural, not a stray margin:**
- `.wcc-panel-track` is `min-height:100vh; align-items:center`, and cards are capped
  (`height: min(82vh, 820px)`). On a 1500px-tall viewport the card is 820px, centered → ~340px
  empty band **above and below** each card. That band is the gap.
- Compounded by `.wcc-hero` being `min-height:100vh` with content shorter than the viewport, so
  the hero also has empty space (top with `align-content:end`, or split with `center`).
- Net: scrolling hero→panels you see (hero empty space) + (track's empty top band) stacked.

**Why iterating failed:** every tweak (hero `align-content`, card cap) only shifts *which* empty
band you see. The gap is inherent to "fixed-size cards centered in 100vh sections."

### Fix options (ranked, pick one — all are small)

1. **Make cards fill the track height (recommended).** `.wcc-nav-panel { height: min(88vh, 1100px) }`
   (raise/relax the cap) so centered margins are minimal at all heights. Keep width proportional
   to avoid extreme portrait cards. One line; eliminates most of the band.
2. **Top-align the track instead of centering.** `.wcc-panel-track { align-items: flex-start;
   padding-top: <header-safe> }` — cards hug the top, the empty band moves fully below (out of the
   transition view). Changes the vertical rhythm of the horizontal section.
3. **Shorten the hero to a true viewport.** Give `.wcc-hero` a fixed `height:100svh` (not
   `min-height`) so panels begin right at the fold. Risks clipping the huge title on short screens.

Recommendation: **(1)**, and if still loose on >1400px-tall windows, add **(2)**. Avoid stacking
all three — they fight.

## Responsive breakpoint map

| Query | Effect |
|---|---|
| default (desktop) | hero `align-content:end`; horizontal pinned scrub |
| `min-width:801px and max-height:1100px` | hero `align-content:center` (mid-height fill) |
| `max-width:800px` | **no horizontal pin** — panels stack vertically (`.wcc-landing` height:auto) |
| `max-width:600px` | small-screen type/spacing |
| `prefers-reduced-motion` | (present — verify it gates the WebGL veil + parallax) |

Test matrix that matters: 16:9, 4:3, **1:1 and taller-than-1:1** (where the gap shows), portrait
tablet (801–1024 wide, very tall), and the <801 mobile stack. `check:responsive` covers these.

## Known polish backlog (P2)

- Floating buttons (down-arrow + lang toggle) overlap panel content on narrow screens — add
  safe-area padding.
- `prefers-reduced-motion` gate for the always-on 700-pt WebGL particle veil (also a perf win).
- The lang toggle shows `ՀՅ` (correct Armenian — Հ+Յ; *not* a broken glyph). It reads like "⟨3"
  at 52px; consider a clearer affordance if desired, but it is not a bug.

## Files

`src/wcc/landing/LandingPage.jsx` (layout/JSX/scroll), `src/wcc/landing/landing.css` (all styles),
`scripts/responsive-check.mjs` (verification harness).
