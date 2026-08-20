# /out is truly read-only (plan PR 1.1)

## What was wrong

The overnight audit's sharpest new find: RawOutSurface claimed safety by
"handlers simply not passed", but RawViewport mounted OrbitControls whenever
no camera was ●-active — drei attaches its own DOM listeners, so the audience
could orbit and zoom the projector image.

## What changed

RawViewport gained `interactive` (default true). When false: OrbitControls
never mounts (camera or not), onPointerMissed is not attached, the floor
plane carries no click/double-click/drag handlers, and node bodies take no
pointer grabs. RawOutSurface passes `interactive={false}`.

## Verified

Screenshot-hash proof on the local build: /out before vs after a 340px drag +
wheel zoom — identical hashes (LOCKED); the editor's fullscreen room with the
same gesture — different hashes (still orbits). Screenshots read. Full suite
2437/2437, lint, build, anatomy current.
