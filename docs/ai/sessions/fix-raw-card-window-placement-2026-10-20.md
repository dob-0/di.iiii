## Raw: a new node's card window no longer opens over its own node

- Cause: `RawGraphSurface` published its on-screen origin (`originTop`) only on pan, zoom and window resize. When the first node lands the empty-canvas hint leaves and the top bar settles, so the surface moves (168 then 0, really 57 px) with no pan. World windows are rendered through the published origin, so the Laser Out window sat 57 px above where its card was drawn, over Blackout and Budget. Placement itself (`placeNewWindowFrame`) was right: window world y = card y + height + 16.
- Generic: every unpinned window placed beside a card was off by the same stale origin, not only Laser Out.
- Fix: the origin is re-measured on ResizeObserver, one frame after a pan, and on resize; an unchanged measurement is not republished. Saved or dragged window positions are untouched (world units).
- Test: `RawGraphSurface.origin.test.jsx` (fails before: originTop stays 168; passes after: 57).
- Pictures: rawwin-before.png / rawwin-after.png in ~/di-health/merge-proof (agent screen, /raw local canvas, Laser Out added).
- Not tested: phone width, pinned windows, a second browser engine.
