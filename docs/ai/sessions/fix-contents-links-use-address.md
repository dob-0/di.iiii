# fix/contents-links-use-address

## The space's own links (the "Everything in this space" badge, the hub's "Everything inside") use its address, not its id

- 2026-10-25: after #1128 the sweep (`scripts/space/sweep-space.cjs`) still found /dilijan/projects on all 14 Dilijan pages on
  dev: the floating badge `SpaceContentsBadge` got `resolvedRouteSpaceId`. Now `spaceAddressOf` (moved to `src/utils/spaceAddress.js`)
  feeds the badge and SpaceHub's "Everything inside"; known-fixes entry written. The admin console's button keeps the id (admins).
