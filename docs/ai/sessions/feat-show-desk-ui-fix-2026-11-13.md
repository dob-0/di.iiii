## 2026-11-13 — Show desk: scene keys wrap into rows, Touch fits the 766 px stage window

- The owner's screenshot showed the Show desk cut off on the stage screen (1278 x 766 logical px). Rendered it read-only with
  `scripts/show/desk-shot.cjs` (files from the tree, GETs from the live desk, every other method blocked): all 26 scene keys sat in one
  sideways-scrolling row (11 visible), the look text ran under the colour dots, and the page ended well short of the window.
- `show.css` tail block only (no JS): the scene keys wrap into as many rows as the scenes need up to a cap (Compact 168 px, Touch 150 px,
  114 px with 52 px keys on a screen under 800 px high; more scroll down, never sideways); the look line stops short of the dots; in a short Touch
  window the cube preview stops growing so On / Off stay on screen. showDesk.test.js passes.
- Not done: the top bar still truncates the scene names ("MUTH 03 ...") and has an unlabeled empty field next to "Laser On". Not installed on the stage Mac:
  an install reloads the owner's pages, and the laser was armed.
