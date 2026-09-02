## 2026-09-02 — Raw's windows live on the canvas with their cards

The owner, looking at Raw through the desk at 130% and then at 70%: "when I
scroll it changes only the node size", "the window of nodes is not size
changeable", "when I create multiple things the Raw window will be full and I
can't use it how I want". Four parallel code audits plus a headless walk at
1108×948, 820×600, 390×844 and inside an 80%-scaled iframe confirmed the
model behind all three: cards were on a zoomable canvas, windows were
`position: fixed` viewport furniture. The old Beta lane had windows INSIDE
the scaled stage (`canvasZoom` was still being divided by, and nothing passed
it); the lane merge flattened them out.

- **Windows are on the canvas.** A panel node's window renders inside
  `.raw-graph-stage` (RawGraphSurface takes `children` as a function of the
  live viewport), so pan and zoom move and scale cards and windows together,
  and the canvas has no edges to clamp against. `frame.space === 'graph'`
  means graph units. A window with no position of its own — every new one,
  and every frame from before this — sits `RAW_WINDOW_CARD_GAP` to the right
  of its card and FOLLOWS the card until someone moves it. No migration op:
  opening a project never changes it; the first move writes graph coordinates.
- **⌖ means something now.** Pin = leave the canvas for the screen at the same
  place on screen (`space: 'screen'`, the old fixed clamp); unpin = come back
  onto the canvas where it is. Converted through the live viewport.
- **Resize from every edge and corner**, pointer-captured (the old single grip
  died the moment a drag crossed the iframe edge — the exact gesture for
  enlarging a window in the desk), arrow keys on the title bar and the grip.
  Floors 200×120 instead of 260×180, and the title bar no longer wraps to a
  second row (that was 100 of a 180px window). The screen-space clamp no
  longer moves a window when a resize hits the floor.
- **Double-click a title bar** = zoom the graph to that window (`frameRect`).
- **Wheel policy:** over a window BODY the wheel is the panel's (scroll, orbit);
  over the frame or the canvas it zooms; ctrl/⌘+wheel (a trackpad pinch) zooms
  from anywhere. The step is proportional to the delta, not a flat ±10%.
- **The fit frames windows too** (`extraBounds`), and a `ResizeObserver`
  re-fits when the container itself changes size while the view is untouched.
  Far out (zoom < 0.3) window bodies stop painting.
- **Screen-space fixes from the audit:** bottom reserve is 40 on a wide
  viewport (120 was 22% of a 584px embed); a short viewport no longer parks a
  header above the top edge; a phone rotation no longer shrinks a window for
  the rest of the session (re-clamp from the stored frame); the ⋯ menu was
  clipped by the phone topbar's scroller and is fixed-positioned there now;
  `getGraphEdgeInsets` counted a window spanning both axes as nothing.
- **The Scene window's canvas** measures its layout box (`offsetSize`), not
  the painted one — inside the scaled stage the R3F canvas sized itself to
  70% of its window and then got scaled again.
- The seeded example's two windows sit on the canvas above their cards.
- Not done: the desk app's own grips/maximise (its owner is fixing them);
  `handleFilesDropped` still passes client pixels as graph coordinates; the
  screen-space minimized-bar constant (56) is still a guess for narrow bars.
- Verified headless (Chromium, Playwright) at 1108×948, 820×600 and 390×844
  and in an 80%-scaled iframe: zoom scales cards and windows alike, pan moves
  both by the same delta, west-edge resize, drag, pin/unpin round trip,
  minimize, palette-create beside the card, title-bar framing. Not yet seen
  on the owner's desk; the branch runs on localhost:5174 for that.
