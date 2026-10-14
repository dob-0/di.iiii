## 2026-10-15 — the desk says when it cannot draw a state, reads caps, and the node console is inventoried

- Steps D0 and D1 of the vizzz.di plan (`docs/DI_DESK_UI_PLAN.md`, branch `plan/di-desk-ui`): the node will serve this desk as its console.
- D1: a render error in `pullState` no longer resets the poll failure counter or reads as offline; the last good state stays and a non-blocking line says "the desk sent a state this page cannot draw: <key>". `state.caps` (absent = full desk) is read through `cap(name)`; MIDI and mic controls hide when `caps.midi`/`caps.audio` is false or the page is not a secure context. Code in `ui/caps.js`; tests in `tests/test.js` (130 → 133).
- D0: `docs/ai/vizzz-node-console-inventory.md` — 46 functions in the node's own console: 13 exist here, 13 partly, 20 missing (16 carried, 4 dropped). Nothing built from it.
- Not done: the offline banner's wording is still "server offline — is node server.js still running?" (plan D1 wants it to come from caps, a later change).
