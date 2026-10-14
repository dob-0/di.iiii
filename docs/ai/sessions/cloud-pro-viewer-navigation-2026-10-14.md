## Cloud - the view page: one walk on every device (2026-10-14)

Pointer lock removed from the public walk (`LiveProjectScene.jsx` Walker): drag looks, wheel deltaY dollies / deltaX turns / ctrlKey pinch zooms (non-passive, the page never scrolls or zooms), Safari gestures, Esc exits. Input maths in `src/components/walkInput.js`. Audit `docs/ai/audits/2026-10-14-viewer-navigation.md`; walk `scripts/audit/viewer-navigation.cjs` (not run: no backend in the sandbox). Open: Studio walk and Build surface still use pointer lock (other owners).

Review fix: the lock is back as the default `walkLook='lock'` (/build, Jam); only the view page passes `walkLook="drag"`.
