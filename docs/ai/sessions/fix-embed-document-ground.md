# fix/embed-document-ground

`?embed=1` was incomplete when it shipped, and it shipped to production.

## What was wrong

The mode made the viewer's own `<main>` and its code-view iframes transparent. It
did not touch `html`, `body` or `#root`, which carry `background: var(--di-black)`
from `base.css`. So an embedded page opened on its own is a **black box** — I
measured it on both tiers and then looked at a screenshot of the isolated URL to
be sure: chrome cores floating on solid black.

br_id_ge's ending looked correct throughout, which is why this survived review.
It looks correct because the rite *also* injects
`html,body,#root{background:transparent!important}` into the frame from its own
side — the exact workaround `?embed=1` exists to retire. The mode was leaning on
the thing it replaced.

## The trap in the fix

`PublicProjectViewer` declares `const document = state.document`. That shadows the
global for the **whole function scope**, so an effect written with a bare
`document.documentElement` resolves to a project document object and silently does
nothing — no error, no class, and the page stays black. The effect uses
`window.document` and says why in a comment.

## Verified

`lint` clean; `vitest run src/project/components/PublicProjectViewer.test.jsx`
12/12. The new guard asserts the class is applied in embed mode and released on
unmount, and was watched failing against the shipped version first.

Not yet looked at on a tier — this branch has not been synced anywhere. That check
belongs with whoever lands it: open `/<space>/<page>?embed=1` directly, not inside
the rite, because inside the rite br_id_ge's own override hides the bug.
