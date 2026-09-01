## 2026-09-01 — the front door is the room, and the badge stops looping back to it

- **`/` opens the home room instead of a page about it.** The landing already rendered
  the `main` space as a decorative backdrop and wrote the wordmark and the one line in
  HTML on top of it, so `/` and `/main` showed the same room and only one of them let
  you into it. `/` now opens the room itself. `/main` is untouched and still works — a
  public address is never withdrawn — and the landing page is moved, not deleted: it is
  at `/?tour=1`, the same escape hatch the local home already used.
- **"Made with di.iiii — build yours" no longer appears inside di.iiii's own space.**
  Its href is a hard-coded `/`, and `/` renders `main`, so in that room the one
  affordance meant to lead somewhere led back to where the visitor was standing. Owner
  found it by walking the room. It is judged from an explicit `spaceId` prop threaded
  through `PublicProjectViewer` → `PublicProjectSceneSurface` → `LiveProjectScene`;
  a first attempt read the route with `useLocation()` and threw in every surface that
  mounts without a router (18 tests), which is why the prop is worth the three lines.
- Two existing viewer tests used `spaceId="main"` as an arbitrary fixture while
  asserting the badge is present; they now use a visitor space, which is what they
  always meant. Root-route tests updated to the new intent.
- The room itself is **data, not in this branch**: four portals to WCC / br_id_ge /
  beyond_form / algovrithm, a 3D wordmark and tagline, spawn pulled back so the arc
  composes on a phone. Two traps worth keeping: 3D text lies FLAT until the entity
  rotates +90° on X, and an entity with no authored `animation` inherits `float`,
  whose Y-spin reads as a roll on rotated text — pin `mode: 'static'`.
- Guards: `src/components/madeWithBadge.test.jsx` (4 cases; 2 fail against the pre-fix
  component, verified by disabling the guard). Wiki updated for both changes.
