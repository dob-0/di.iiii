# feat/viewer-embed-mode

`?embed=1` on the published viewer: transparent shell, transparent code-view
iframes, no Made-with badge, no Walk/Fly, no black loading screen.

## Why now

The user sent a screenshot of `di-studio.xyz/br_id_ge/rite` with "fix this its so
ugly". I reproduced the ending headless at DPR 2 through the rite's own
`window.__end(33)` probe and looked at it: the field, which the rite opens
*inside* its own ending, arrived as an opaque rectangle. Its bottom edge cut a
hard line straight across the page, and behind it sat the two things the whole
rite exists to hand over — the shared body made of everyone's words, and the mark
the visitor had just drawn. Both were covered.

`field.html` already carried the diagnosis in a comment, and named the fix it was
waiting for:

> Paper, not transparent — measured on the live site, not assumed. The embedded
> field arrives wrapped in a second di.iiii viewer whose iframe is sandboxed
> WITHOUT allow-same-origin, so the rite cannot reach in and quiet the wrapper's
> dark shell; "transparent" therefore renders as a black box. […] The day the
> viewer grows a real ?embed=1 mode this can return to transparent.

The rite has been appending `&embed=1` for months. Nothing on this side read it.
So this is not a new feature so much as the answer to a request already being
made — which is why it belongs in the viewer and not in another workaround on
br_id_ge's side.

## What changed

`PublicProjectViewer` gains `isEmbed`, read from `?embed=1` exactly the way
`isPreview` reads `?preview=1`. It gates five things: the `<main>` background,
both code-view iframe backgrounds, the badge, Walk/Fly, and the LoadingScreen —
that last one because it is deliberately black and full-bleed, so inside a window
it would flash the very box this removes on every open.

Guards in `PublicProjectViewer.test.jsx`: a scene page, a code page (the case
that matters — br_id_ge's field is HTML, so the srcdoc iframe was the opaque
surface), and the un-embedded default keeping its dark shell and badge. All three
watched failing against the unconditional background before the fix.

## Not done here, and it must come second

`field.html`'s `html.embed,html.embed body{background:var(--paper)}` can now
return to transparent — but only AFTER this ships to prod. Flip it first and the
field goes transparent over a viewer still painting `#05070a`: a black box, which
is worse than the seam. Order is di.iiii → prod, then br_id_ge.

## Verified

`lint` `build` clean; `vitest run src/project` 274/274; `docs:wiki:check` passes.
The visual claim is verified on **staging** — see the branch's report, not this
file. Nothing here is proven by the unit tests: they assert a style attribute,
not that a page reads.
