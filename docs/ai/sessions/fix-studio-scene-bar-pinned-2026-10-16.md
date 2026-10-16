## 2026-10-16 — Studio Scenes: the scene bar stays pinned while editing

Branch `fix/studio-scene-bar-pinned-2026-10-16`, from origin/dev. Owner: "i want to delete scene i can't". Delete already worked, but
New / Duplicate / Delete / up / down sit at the top of the scrolling `.sfp-content`, so Edit on a far-down row left them off the panel.

- **Change:** one CSS rule in `src/studio/styles/studio.css`: `.scene-picker .sfp-content > .scc-section:first-child` is `position: sticky; top: 0; z-index: 2`
  with the panel's solid colour. No new buttons, no JSX change.
- **Measured (agent screen, 1600x900, scratch stack, moxir-v2-11 copy, 52 scenes, Edit on row 41):** Delete top before -2094 px (panel 370..852),
  after 377..409 px (inside). Delete one scene: 52 -> 51, still 51 after reload.
- **Validation:** `npx vitest run src/studio/components/ScenePicker` 12 passed; `npm run lint` ok. Sticky is layout, which jsdom cannot assert; the browser
  measurement is the proof. Not tested: the owner's own screen size, touch, a scene list shorter than the panel.
