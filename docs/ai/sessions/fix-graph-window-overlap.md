## 2026-08-18 — "there are no in/out connectors": the fit centred cards under a window

- Owner report with a screenshot at ~1050px: too much overlap, and World had no visible
  connectors at all. Reproduced exactly: at that width the World window sat on top of the
  card column and its output dot was covered by `raw-window-header` — not a rendering
  glitch, the port was genuinely unclickable.
- **Root cause**: `RawGraphSurface`'s auto-fit centres the card cluster on the viewport's
  own centre, with zero awareness of the two floating windows the starter seed opens. A
  corridor between the windows can be technically wide enough for the cards and still bury
  them if it isn't centred — which is exactly what happened: world+text left a 281px gap
  that ran 304..585, while the centred 202px card lane ran 424..626.
- **Fix, in three parts**:
  1. `getWindowLayout.getGraphEdgeInsets` (new, pure) turns docked window frames into
     left/right/top/bottom insets, charging each window to the edge it hugs. Reports the
     TRUE footprint — an earlier draft scaled insets down to cap them, which understated a
     window's real size and let cards spill into it anyway (caught before shipping, at
     800x950 in the phone-narrow stacked layout). Only gives up on an axis when there is
     truly no room (an absolute floor, not a fraction of the viewport — a fractional floor
     wrongly disabled dodging on a real phone where two edge windows leave ~17% free).
  2. `RawGraphSurface` accepts `contentInsets` and folds them into `visibleBox()`, so the
     fit centres on the free band, not the whole container. Windows mount a beat after the
     graph does, so a second effect re-fits when the insets change — but ONLY while the
     view is still exactly where the first fit left it, so a person who has already panned
     is never yanked.
  3. `starterWorkspace.js`: `math.mix`-unrelated — the seed's own window sizing is capped
     so the two edge windows can never eat more than half the width minus the card lane's
     half-width and a gutter, and the narrow-layout card gap widened from 88 to 112 (it was
     smaller than World's own 98px card height, so cards overlapped EACH OTHER).
- Verified with a pixel-measuring Playwright harness across 700–1920px: **zero overlaps,
  5/5 ports reachable at every desktop width**, including the exact ~1050px from the
  report. Did a real interactive test at that width too: placed a fresh `value.string` node
  from empty canvas and dragged a new wire onto World's Title port — it connected.
- New tests: `getGraphEdgeInsets` unit coverage (edge-charging, the historical bug's exact
  numbers, the truthful-vs-scaled-inset regression, the give-up floor) in
  `windowLayout.test.js`; a numeric corridor-straddles-centreline check against the real
  seed builder across 11 widths in `starterWorkspace.test.js`.
- Verified: lint 0 errors · 2188 tests · build clean.
- **Not fully closed**: a real 390×844 phone still shows one self-overlap — the seeded
  `welcome` window sits over its own card's `content` port when the graph is small enough
  to hit `FIT_MIN_USEFUL_ZOOM`'s neighbourhood-fit fallback, which centres on the seed
  node's position rather than the whole cluster's centroid, so a card near the cluster's
  edge can still poke past a docked window. Pre-existing (baseline was 3/5 reachable before
  today, worse than this); now 4/5. Left as a named follow-up rather than touched blind —
  fixing it means changing how EVERY graph centres on a phone, not just the seed.
