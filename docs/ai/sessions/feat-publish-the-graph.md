## 2026-08-22 — a graph publishes as the room it makes

The owner's call on "what publishing a graph means": build the real thing.

It turned out not to need a compiler, which is why it had stayed open. `RawViewport`
already renders a scope's spatial nodes **and** the root-scope entities in one room —
it is what the node editor's own viewport shows, and what `/out` has been handing
projectors all along. The published page had never been pointed at it. It is now,
behind the same lazy boundary as the other two renderers, whenever a document has
nodes; an entities-only document keeps `StudioViewport` and is untouched, which is
nearly every published page there is.

`/dilijan/team-1` now shows the three cubes, the picture plane and the TEAM 1 title
together, full-bleed — the same room the desk shows. It used to show the title alone.

**The trap, and it cost the first attempt:** a lane's components carry that lane's
stylesheet. `raw.css` is imported by `RawApp`/`BlankNodeWorkspaceApp` and nowhere
else, so mounted bare the viewport lost `.raw-viewport-shell`'s
`position: absolute; inset: 0` and the canvas collapsed into a band across the top of
the page with dead space under it. Seen in a browser, not caught by any test — the
unit tests were green throughout. It is the same ruling that kept Studio's MUI
`PublishPanel` out of Raw, arriving from the other direction. The stylesheet now rides
the same chunk, via `src/raw/PublicGraphSurface.jsx`, which is safe to bring along
because every rule in `raw.css` is class-scoped: no element, `:root`, `html` or `body`
selectors, so it cannot reach the viewer's own chrome.

This also removes the "This project is a node graph" notice added earlier the same
day. It was an honest apology for an empty room; there is no empty room now.

Still not done, and not this branch's business: `/{space}/{project}` for a node
project renders the room but Walk / Fly still enters `LiveProjectScene`, which is
entities-only — a visitor who walks into a node-built room finds it bare.
