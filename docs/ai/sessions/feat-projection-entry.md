## 2026-09-20 — one door and one name for Projection

- A newcomer walk (`~/Downloads/newcomer-walk/REPORT.md`) found the projection mapper
  unreachable from Studio (the room a new project drops you into), reachable only
  through top-nav Tools, and wearing four names (Tools card "Projection", mapper
  header "MAPPING", route `/map/`, wiki "Putting a space on a wall").
- Studio's project panel gets a **Projection** button beside **⇄ Nodes** in DISPLAY
  (desktop control cluster and the phone topbar), navigating to `/{space}/map/{project}`.
  The mapper header gets the reverse link, `← Studio`, in the header's existing
  `map-action` button style. Studio's Help → Share tab gets one line pointing at
  Projection and linking the wiki article.
- Tools' Projection card: `meta` text changed from "needs a project" to "pick a
  project" and the `muted` dimming modifier removed (Desk keeps its own dimming —
  untouched). The picker's empty-space state ("has nothing to open yet") now offers
  "+ new project" inline, using the same `createProject` call Studio's own hub uses,
  landing straight on the mapper for the new project.
- Naming: mapper header text is now "Projection" (renders as PROJECTION via the
  existing uppercase CSS). Wiki article `projection-mapping` keeps its sentence
  title ("Putting a space on a wall") but its first line now opens "Projection opens
  a mapping, at…" tying the three names together. No route, id or CSS class changed.
- Verified live (local isolated dev stack, ports 4310/5310, throwaway spaces
  `entry-test` / `entry-test-ph2` / the pre-existing `entry-test-p`): full walk
  landing → new space → new project → Studio → Projection → mapper → back, and
  Tools → Projection → pick space → pick project → mapper, at 1440×900 and
  390×844 DPR3. Screenshots in `~/Downloads/projection-entry/` (not in-repo).
  Click count, "project created" → "mapper open": **1** (the new Projection
  button, right where Studio lands you) — down from the newcomer walk's count
  of 4 for the same span (leave Studio, click Tools, click the Projection
  card, pick the space, pick the project), and from a path that required
  already knowing Tools existed and led there. The Tools → Projection route
  itself (for someone who arrives via Tools directly, not mid-Studio-session)
  is unchanged in shape — card → pick space → pick project, 3 clicks — but the
  card no longer reads as disabled, and now offers "+ new project" when the
  picked space is empty.
- Skipped: the create-project dialog/form (`StudioHub.jsx`'s `sh-new-form`,
  `StudioProjectsPanel.jsx`'s `spp-new-form`) has no existing hint element to add
  a line to — both are a bare input + Create/✓ button with nothing else in them.
  Adding one would be inventing a new UI element, which the brief ruled out, so
  no change was made there.
