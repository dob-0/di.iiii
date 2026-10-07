## 2026-10-08 — a Look switch in the viewer: Current (as it was) and Form (dim environment fill)

- Owner, after the 2×2 trial: dark is better, 0.15, it can go lighter, and the current look must stay as a parallel one.
- `src/project/viewport/viewLook.js` (a per-browser store: look `current|form`, light 0…0.5, default 0.03 (chosen by the owner on his screen), localStorage
  `di.view.look` / `di.view.formLight`), `FormLight.jsx` (RoomEnvironment through PMREM as `scene.environment`, only in Form,
  skipped when the room has its own authored environment), a Look button + Light slider under Full/Lite in
  `PublicProjectViewer.jsx`, mounted in `StudioViewport.jsx`. Guard: `viewLook.test.js`. The document is never written.
- Seen (headless, software GL, real app): Current is unchanged; Form 0.15 and 0.35 add form to steel, rust and floor.
- Measured/seen limit: in the app 0.15 already reads lighter than in the standalone trial, because the app's exposure is 3.5
  (plus auto-exposure). The right default for a night show is the owner's call by eye on his screen.
- NOT done: walk mode (LiveProjectScene) does not take the Look yet; the textured hall is not in any project; not seen on the
  owner's screen; no real-GPU frame time with the environment on.
- Default Light set to 0.03 on the owner's word (2026-10-08: "0.03 is ok"), seen working on his screen before that ("yes its changes lights").
