## 2026-09-24 — the studio deck came back: restore-entities puts back what a project lost

- The front room `main-dii-project` lost its 76 slides (the studio portfolio deck): deleted on local + dev by the 09-16 facade audit as "debris" (one file sampled), then carried to prod on 09-18 by a whole-document replace. The files were never lost, only the entities.
- `scripts/restore-entities.mjs` reads the tier's current document, takes the entities a saved copy (the nightly backup, `~/work/di-spaces`) holds and the tier does not, checks every media file answers, and appends `createEntity` ops through the ordinary ops route. It never replaces the document. Tests: `scripts/restore-entities.test.js`.
- Run by the owner on dev 2026-09-24: 76/76 files answer, 76 restored, dev `main-dii-project` v240 → v316; the slides are back where they were (flat on the floor, x 0..57, z 0..54). Prod: not yet.
- Owed: the room redesign around the deck (updated from the Canva master "in__ di.ii : XR studio_network", 94 pages), and the prod restore.
