## 2026-10-28 — a project opens what it is: its scene, its code page, or its plain project view (never an empty 3D room)

- Bug (owner, dev.diiii.xyz): a new space such as cinema-house, with one project and no scene, always landed in the 3D scene view, because `entryView` defaults to `scene` for every document.
- Change: `src/shared/openingView.js` `resolveOpeningView(document)` decides from what the project holds — a stored `code` or `fixed-camera` choice is kept; else objects or nodes present → scene; else code present → code; else `page`. `PublicProjectViewer` uses it, and `page` shows the project's title and its picture assets instead of a 3D canvas.
- Limit: a stored `scene` cannot be told from the schema default (the server stores normalized documents), so `scene` on a project with nothing in it now opens the plain view.
- Not done: a space with no project at all still falls through to the editor (`SpaceSurfaceApp.jsx`, the final `<App/>`); the plain view shows title and pictures only, no notes (the schema holds none); not looked at in a browser on dev.
