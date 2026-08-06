# Session notes — fix/hide-public-project-switcher

## 2026-08-07 — public project pages drop the floating project switcher

- Owner call (from the staging screenshot of `/br_id_ge/rite`): the `br_id_ge ▾`
  chip and its dropdown clashed with the published page's design. The switcher is
  right in Studio, where you're working — not floating over a public face.
- `SpaceSurfaceApp` no longer passes `showProjectSwitcher` to `PublicProjectViewer`,
  so direct project links (`/:space/p/:id` and vanity `/:space/:slug`) render
  chrome-free like the live route. `ProjectSwitcher` itself is kept (unreachable
  from public routes) for a possible future edit-context surface; Studio's
  Projects window still covers project hopping.
- Regression guard in `SpaceSurfaceApp.test.jsx`: the viewer mock now surfaces the
  prop and a test asserts direct links stay switcher-free. Wiki `publishing` entry
  updated to match. This also resolves the open "`br_id_ge ▾` chip covers the
  letter-row" call in CURRENT.md — the chip is gone from public pages entirely.
- Verified by looking: local vite (port 5473, proxied to the staging API) rendered
  `/br_id_ge/rite` desktop + iPhone-13 viewport and `/br_id_ge/p/landing` — no chip
  on any of them. Lint 0 errors, build green, full suite 1798/1798.
