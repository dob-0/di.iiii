## 2026-11-18 — code pages with deviceAccess also get Web MIDI

- A code page the owner opts into `deviceAccess` now gets `midi` in its iframe `allow` list (public viewer and Studio preview), through `pageAllow()` in `src/utils/pageFramePermissions.js`; without the opt-in the list is unchanged. For a music page driving an Akai APC40.
- Tests: PublicProjectViewer.test.jsx and StudioPresentationSurface.test.jsx assert `midi` present with deviceAccess and absent without. Not tested: real hardware.
- `src/components/PresentationCanvas.jsx` has two sandboxed iframes with the same allow list and no deviceAccess switch; left as is.
