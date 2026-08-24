## 2026-08-24 — a portal opens by walking into it, not only by clicking it

- Portals were click-to-enter only (`PortalObject.jsx`'s `PortalGateway`). That is the right
  verb in orbit mode and the wrong one in walk: the hands are on WASD or the joystick, the
  mouse is looking, and in a headset there is no cursor to aim at a ring at all. Walking into
  the ring now travels through it. Clicking is untouched and still works everywhere it did.
- The proximity check is a small state machine of its own, `src/components/portalWalkThrough.js`,
  because the hard part is the latch rather than the distance — a per-frame "am I inside the
  ring" fires sixty times a second while a visitor stands in one, and a boolean that never
  resets means they can never come back the other way. `Walker` owns one instance for its
  lifetime and calls it once per frame; `LiveProjectScene` navigates with the existing
  `portalHref` + `appNavigate`, so a jump is the same SPA route change a click makes.
- Enter radius **1.3 metres**, scaled by the portal's own `transform.scale` on X/Z (the ring
  lies flat). The drawn torus is major radius 1.1 + tube 0.12 = 1.22 outer edge, so this fires
  as the visitor's feet reach the ring they can see, and a portal scaled 3x is a 3x bigger door
  that opens from proportionally further out. Re-arm at 2x that, 2.6 m: standing in the ring
  cannot repeat and a step backwards onto the threshold is still one arrival. Nothing to do
  with the nearest-zone pass's squared 900 (30 m) — that is the atmosphere tint, deliberately
  generous, and it is unchanged.
- The check sits ABOVE Walker's `if (isPresenting) return`, on purpose: it reads the pose and
  never writes it, and `XrLocomotion` keeps `playerRef` in sync for the whole session — so a
  headset visitor walks through a ring too, which is the only way they can reach one. No
  XR-specific code was added. Not verified on hardware; nobody has walked a headset through
  this yet.
- **Embed portals are excluded, and that is the load-bearing exclusion.** WCC's exhibition
  floor is ten `mode: 'embed'` portals and every one of them carries a real `spaceId` and
  `projectId` (checked against the prod space snapshot in `~/di-spaces`). Treating them as
  doors would fling a visitor out of the gallery the moment they walked up to a sculpture.
  Hidden portals and portals with no `spaceId` are excluded too.
- The bounce-loop risk (arrive in a room standing on the way back, get sent straight out
  again) is guarded rather than argued away: nothing travels until the walker has been seen
  clear of every ring at least once. Checked against every project document in the prod
  snapshot — only `wcc/main.json` has portals at all, all of them embeds, so no live room
  exercises this today; the camp's `dilijan` rooms are staging-only and could not be read from
  here. The guard was then made to earn itself in a browser (below).
- **Walked, in a real browser, and looked at.** Seeded a throwaway serverXR + vite on spare
  ports (the recipe `.github/workflows/browser-checks.yml` uses for `input-check`) with a space
  of three rooms — a hall, a room, and a trap room whose way back sits exactly on the spawn —
  and drove headless Chromium at DPR 2 through it. Seven checks, all green: walking into the
  hall's ring lands in the room; standing still there for four seconds does not jump again; the
  room's return ring walks back to the hall; spawning 0.00 m from the trap's ring does NOT
  bounce, and after stepping 5.2 m clear, walking back in DOES travel; `?preview=1` and
  `?embed=1` offer no Walk / Fly and never move. Screenshots opened, not just captured: the
  ring on the floor with its label in walk mode, the arrival room, the trap spawn standing
  inside the ring, and the hall after the return.
- What the walk showed that the code does not: **arrival is in view mode, not walk.**
  `SpaceSurfaceApp` keys the viewer on `space:project`, so a jump remounts it and `navMode`
  resets to `orbit` — you go through the door and find yourself looking at the next room from
  outside, having to press Walk / Fly again. That is exactly what a click does today, so it is
  not a regression, but it is the seam that makes a hub of rooms feel like a website rather
  than a building. Left alone deliberately: carrying walk mode across a jump is its own change.
- Not verified: the headset path (no hardware here), and how the crossing FEELS at 1.3 m to a
  person rather than to a script — whether it reads as going through a door or as being
  grabbed. That is a staging job.
- Tests: `src/components/portalWalkThrough.test.js` (22, the state machine walked step by step)
  and `src/components/walkThroughPortalWiring.test.jsx` (10 — four of them a real render + real
  click on the ring, proving click-to-enter intact; the rest source guards over
  `LiveProjectScene.jsx`, in the style of `livePlayerRef.test.js` next door and for the same
  reason). Each guard was watched to fail with the feature deliberately broken.
- Wiki: new "Walking through a door" article in `wikiContent.js`.
