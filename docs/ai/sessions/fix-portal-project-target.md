## 2026-08-24 — a portal could name a project and still not go there

- `PortalGateway` navigated to `/${spaceId}` and ignored `reference.projectId`
  entirely, even though the reference component has always carried one and the
  portal's own label falls back to it. So a hub whose doors point at rooms
  INSIDE one space was inert: every door re-opened the room you were already
  standing in, with no error and no console warning.
- Found building the Dilijan camp hub — five doors, all `spaceId: 'dilijan'`,
  clicking any of them left the URL unchanged.
- The routing decision is now `portalHref(spaceId, projectId)`, pure and
  exported so it is testable without mounting a canvas: a named project gives
  `/space/project`, no project still gives `/space`, no space refuses to
  navigate at all, and whitespace is trimmed rather than baked into a broken
  path.
- Embed mode already used `reference.projectId` correctly — only the gateway
  jump was ignoring it, which is why nobody had noticed.
