## 2026-09-16 — Wave 3 facade audit: front-room faults (red ring, white planes, camera freeze)

Fixed the three front-room defects from the wave-3 facade audit (`main` space at `/`,
and door entry). Explicitly out of scope: the room title bevel (owner is picking that
in a sketch) and the other four wave-3 items (button styles, headers, thumbnails,
"Only you 0") — not touched.

### 1. Red glowing ring — SCENE DATA, fixed on local + dev
The WCC door (`e-flagship-door-1`) was authored `appearance.color: "#ff2a2a"`.
`PortalObject.jsx`'s `PortalGateway` renders the ring's material as
`emissive={color}` straight from that field — so it was a genuine glowing red
ring, off-brand ("one cyan accent, no glow, no bevel"). The code's own default
(`color = '#4df9ff'`, `PortalObject.jsx:243`) is already the brand cyan the
algovrithm door uses — only this one entity's stored color was wrong. Brought
it to `#4df9ff` via an `updateEntity` op. No code change needed for this half.

### 2. Leftover white photo planes — SCENE DATA, fixed on local + dev
76 leftover `image` entities sat in a dense grid (x: 0..57, z: 0..54, all at
y=0.01 — nearly coplanar with the floor, hence the z-fighting) spanning far
outside the room's real footprint (documented subject span is x ±12.8,
`reference-dii-front-room`). Downloaded one of the referenced assets
(`1.webp`) and confirmed by pixel histogram it is ~98% pure white — so the
"white plane" look is the actual image content, not a fallback/placeholder
render (`ImageObject.jsx`'s failure fallback is dark teal `#12292b`, never
white, and `EntityContent.jsx`'s `case 'image'` doesn't even read
`appearance.color`, so the `#ff0000` stored on all 76 was always irrelevant
to what renders). This is debris from an unrelated import/test batch, not
room content — deleted via 76 `deleteEntity` ops.

Both fixes applied with `node <scratchpad>/fix-front-room-data.mjs --base
<tier> --token <token>` (script + full JSON backups of both tiers' documents
pre-fix live in the session scratchpad, not the repo). **Prod was not
touched** — replay command recorded below for the owner.

### 3. Camera freezes on arrival — CODE, fixed here
`src/project/viewport/PortalObject.jsx`: `enter()` starts a door glide via
`setGlide({ ms, reach, target, resolve })`, and `EntryGlideCamera`
(`src/components/entryTransition/EntryGlide.jsx`) stays mounted — with a
priority-1 `useFrame` that pins the camera to the glide's end pose and calls
`gl.render` itself every frame — for as long as `glide` state is non-null.
Nothing ever set it back to `null` after `request.resolve(...)` fired, so
if that `PortalObject` instance survived the route change (confirmed live:
clicking a door then browser Back sometimes lands back in the room with the
camera still locked at the glide's stop position, pixel-identical
before/after an orbit drag), the camera was frozen for good — unresponsive
to the walker/orbit controls running underneath it.

Fix: added `withGlideCleanup(resolve, clear)` (a tiny exported pure wrapper)
and used it in `enter()` so resolving the glide promise and clearing the
`glide` state that keeps `EntryGlideCamera` mounted happen together,
inseparably. Regression test: `PortalObject.glideCleanup.test.js`.

### Verification
- Signed-out visitor, desktop 1440×900 @2× and phone 390×844 @3×, headless
  Chromium with `--disable-gpu --use-angle=swiftshader` (GPU headless froze
  this machine on 09-14 — see `project-dii-facade-audit-2026-09-14`).
- Live repro of the freeze on `staging.di-studio.xyz/main` pre-fix: click the
  WCC door → `/wcc` → Back → `/?room=1`, camera stuck close inside the ring,
  drag-to-orbit produced byte-identical screenshots. A second attempt did NOT
  reproduce (browser Back sometimes fully remounts, sometimes doesn't) —
  consistent with a race, not a deterministic repro every time, which matches
  the audit calling it intermittent ("freezes on arrival") rather than always.
- Data fix verified before/after on both local and dev tiers: red ring gone
  (all four doors cyan), 76 white planes gone, same orbit framing.
- Could not stand up a second local dev stack to re-run the live freeze repro
  against the FIXED code (`vite.config.js` hardcodes port 5173 + `strictPort`,
  and another agent's stack already holds 5173/4000 on this machine — see
  `docs/ai/parallel-agents.md`, no shared working dir). Fix is verified by:
  exact root-cause code citation, a passing regression unit test for the new
  cleanup wrapper, the full test suite green, and `npm run build` green.
- `npm run lint`, `npm run test` (434 files / 4500 tests, all green after
  `npm ci` in both `/` and `serverXR/` — this worktree had neither installed),
  `npm run build` all pass.

### Prod replay (owner's call, not run this session)
```bash
node fix-front-room-data.mjs --base https://di-studio.xyz/serverXR --token $PROD_API_TOKEN
```
Idempotent (re-running after the fix is a no-op — no red door, no `#ff0000`
image entities left to match). Script + before-JSON backups of local/dev in
this session's scratchpad; ask for a copy if it wasn't carried over.
