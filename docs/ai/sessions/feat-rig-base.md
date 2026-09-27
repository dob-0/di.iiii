## 2026-09-28 — the rig-build base: fixture types, snap pieces, auto-patch, patch sheet, MVR + GDTF

- Stack of five draft PRs on `feat/moxir-hall` (#587): #594 `feat/rig-base` (method doc
  `docs/architecture/RIG_BUILD.md`, fixture types, `components.fixture` carries the plot's
  patch), #595 `feat/rig-snap` (pieces + snap), #596 `feat/rig-autopatch` (desk
  `POST /light/api/rig/patch`, Studio `useRigAutoPatch`), #600 `feat/rig-sheet`
  (`/{space}/patch/{project}`), `feat/rig-mvr` (MVR 1.6 + authored GDTF 1.2, validator).
  This note covers all five; the branches merge in order.
- Decision that needs the owner's look: the 2026-09-20 rule "never universe/address in the
  document" changes — the document holds the PLOT's patch, the desk's show.json the RUNNING
  patch; auto-patch keeps them equal and flags differences (RIG_BUILD.md §2.2).
- MOXIR: U1 001–468, U2 001–288; PAR ×50 / CO2 ×6 / laser ×2 mode owed, unpatched; in hall v2
  the lasers are refused by the rig's crane-clash rule. MVR + 7 GDTF validate against the
  pinned XSDs; pymvr/pygdtf parse it; BlenderDMX 2.3.0 imports all 102 fixtures with the
  right patch but draws the beam at home along +Y — axis convention owed.
- Found, not fixed (desk output): sACN sends the desk's U1 as universe 0, which E1.31
  reserves — an sACN node set to 1 will not see it.
- Trap: the app pins html/body/#root (`position: fixed`), so a document page printed only
  its first page; the sheet page lets them flow via a class on <html>.
