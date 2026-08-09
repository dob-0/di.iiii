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

## `window.diiPageOrigin`, added for the same reason

Verifying the fix meant looking at it on staging — and staging could not show
it, because `fieldHref()` hardcodes `https://di-studio.xyz`. It has to: a srcdoc
page has no URL, so `location.origin` is opaque and `location.hostname` is empty.
(`field.html`'s `location.hostname.endsWith('di-studio.xyz')` check had therefore
never once taken its relative branch.) The rite on staging embedded PRODUCTION's
field and read production's crossings.

That is the same gap `diiPageQuery` was added to close, so it is closed the same
way: the bootstrap now hands down `window.diiPageOrigin`. Both br_id_ge call
sites read it and keep their literals as the fallback.

## Not done here, and it must come second

`field.html`'s `html.embed,html.embed body{background:var(--paper)}` can now
return to transparent — but only AFTER this ships to prod. Flip it first and the
field goes transparent over a viewer still painting `#05070a`: a black box, which
is worse than the seam. Order is di.iiii → prod, then br_id_ge.

## Verified

`lint` `build` clean; `vitest run src/project` 274/274; `docs:wiki:check` passes.

The visual claim is verified by **looking at it**, not by the tests — they assert
a style attribute, not that a page reads. A local dev client carrying this branch
was proxied at staging's API and driven through the rite's own `window.__end`
probe at 1440×900 DPR2 and 390×844 DPR3: the seam is gone, the shared body's
letters read as a ring of everyone's words, and the visitor's mark is whole
instead of sliced by the box's top edge.

Also looked at, and worth recording because it is the failure this ordering
exists to prevent: br_id_ge's half was pushed to staging BEFORE this branch
existed there, and the ending came back a **black box** — transparent field over
a viewer still painting `#05070a`. Staging was rolled back to the paper build the
same minute. The comment in `field.html` was right.
