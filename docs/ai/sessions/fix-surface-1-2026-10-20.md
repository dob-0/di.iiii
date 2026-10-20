## fix/surface-1-2026-10-20: loading strip covered Low and Move on a 320 px phone

- Defect: `.model-loading` (centred, nowrap, no max-width) ran the full 320 px and lay over the right-hand view buttons at y 96 px (picture iphone-se--_main.png).
- Fix: `@media (max-width: 480px)` in `src/studio/styles/model-loading.css`: left-anchored, `max-width: calc(100vw - 144px)`, dots hidden, track on the strip's bottom edge.
- Guard: `src/studio/styles/modelLoading.test.js` (red before: no narrow rule).
- Not proven: whether "0 of 2" after 7 s is a stuck load or slow models; not touched.
