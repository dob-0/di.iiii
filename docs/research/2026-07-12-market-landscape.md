# Market landscape & growth research — 2026-07-12

Deep-research pass (105 agents, 23 sources fetched, 25 claims adversarially
verified: 24 confirmed / 1 refuted). Question: how does di.iiii compare to the
web-3D/XR field, what growth mechanics work, what do we miss.
Full cited report artifact: see PROGRESS.md 2026-07-12 entry.

## The field just cleared out (all verified 3-0)

| Platform | Status | Lesson for di.iiii |
|---|---|---|
| Spatial.io | Free/Pro creator tiers **sunset 2026-07-27**, creator files deleted; enterprise-only pivot. Stated reason: free hosted multiuser 3D worlds had no viable business model. | ~2-week refugee window; hosting-economics warning for guest sandbox / free publish. |
| 8th Wall | Hosted WebAR platform dead 2026-02-28 (engine now MIT open source; hosted content read-only until Feb 2027). | Commercial phone-AR incumbents are gone. |
| Adobe Aero | Dead Nov 2025. | Same wave. |
| Meta Spark AR | Dead Jan 2025. | Same wave. |
| Bezi | Pivoted entirely to a Unity AI assistant ($0–$200/mo tiers); exited browser XR authoring. | Category shrank again. |
| Mozilla Hubs | Dead since 2024 (forks linger). | Free hosted co-presence died twice now. |

**Survivors**: Spline (design-tool leader), PlayCanvas (game/dev engine),
Wonderland Engine (headset-perf dev engine, offline/git-native), Needle,
New Art City (virtual exhibitions). Industry framing: pivot away from phone AR
toward headsets + AI pipelines.

## Where di.iiii genuinely wins (verified)

- **Spline has no WebXR export and no runtime multiplayer** (editor-only
  collab; WebXR requires exporting three.js code and wiring it by hand).
  di.iiii's op-log co-presence + WebXR delivery beat the category leader's
  native capability out of the box.
- **New Art City is the closest exhibition analog and it is virtual-only** —
  desktop/mobile browser co-presence, no headset WebXR, no physical-space
  sync. di.iiii's physical↔virtual sync for site-specific shows (br_id_ge,
  WCC, Gyumri) has **no verified equivalent** (caveat: absence of evidence;
  Oncyber/FRAME/Womp/Niantic-Spatial were not covered by surviving claims).
- **three.js is the dominant runtime (~3.5–5M npm weekly downloads, ~9× Babylon)
  and ships no authoring layer** — the artist-facing authoring layer above the
  dominant engine is exactly the seat di.iiii occupies.
- The Swiss-knife thesis holds structurally: each survivor is narrow (design
  tool / game engine / dev engine / gallery); the multi-tool for multimedia
  artists synced to real spaces is an unoccupied intersection.

## What we lack (verified gaps)

1. **Templates + remix loop** — the dominant growth mechanic of the winners.
   Spline community: "discover, remix and share 3D designs #MadeInSpline",
   CC0 remixable files. Framer: 2,000+ template marketplace. Figma: 1,600+
   community resources published per day. di.iiii has zero template gallery
   and zero remix affordance.
2. **AI 3D generation** — now a monetized expectation. Spline: Text-to-3D /
   Image-to-3D gated behind paid plan **plus** +$5/seat/mo credit add-on.
   di.iiii has no AI story.
3. **Publish-to-URL and export are table stakes, not differentiators** —
   PlayCanvas free tier: unlimited public projects, free hosting,
   downloadable self-host builds; paid tiers ($15 personal / $50 seat) sell
   privacy + storage, not publishing. (Refuted in verification: "PlayCanvas
   editor is paid" — it is free.)
4. **Offline/git-native pro workflow** (Wonderland's wedge) — a segment we
   won't win; GitHub sync + bundles answer lock-in but not offline editing.

## Growth playbook mapped to di.iiii

- **Remixable starter spaces**: surface template spaces in the guest sandbox +
  Open Space shelf; "Remix this space" on public spaces (MadeWithBadge +
  invite links are already the share half of the loop — the remix half is
  missing). Whole-space bundles are the mechanical foundation, already built.
- **Institutional/festival distribution** (New Art City's verified path:
  universities, Leonardo/ISAST, The Wrong Biennale): br_id_ge / WCC / Gyumri
  Art Week ARE this playbook — formalize it (course kits, biennale pavilions,
  curator onboarding) instead of treating each show as one-off.
- **Pricing shape when the time comes**: openness free / privacy+scale paid
  (PlayCanvas), watermark on free publish + metered AI credits (Spline) are
  the two proven levers. Never charge for publish-to-URL.
- **Spatial-sunset window (closes ~2026-07-27)**: displaced creators need a
  destination; di.iiii has no Spatial importer, so realistic play is a
  "coming from Spatial" landing + starter content, not a migration tool.
- **Hosting-economics warning**: Spatial died on free hosted 3D. di.iiii's
  sandbox TTL sweeps + archive/revive are already the right mitigation; keep
  measuring per-space cost before scaling free hosting promises.

## 2026 outlook (weaker evidence — directional)

Phone AR collapsed; the surviving energy is headset WebXR + AI creation
pipelines. Direct WebXR device/browser adoption numbers were NOT verified
(open question) — validate before heavy headset investment. AI×3D is safe to
adopt later as a metered add-on; it is revenue-positive elsewhere.

## Open questions

- Real user-base scales of survivors and of displaced Spatial/8th Wall creators.
- Does anyone (Niantic Spatial, Oncyber, FRAME, Hubs forks) do physical-space
  sync for site-specific exhibitions?
- Actual WebXR adoption data (Quest browser, visionOS Safari, Android XR).
- Quantified hosting cost per free space/world (Spatial's lesson, our number).

## Key sources

Spatial sunset: spatial.io/blog/spatial-creator-platform-sunsetting, roadtovr.com.
8th Wall: 8thwall.org/blog/8th-wall-open-source, remixreality.com. Bezi: bezi.com/pricing.
Spline: spline.design/pricing, docs.spline.design, community.spline.design.
PlayCanvas: playcanvas.com/plans. Wonderland: wonderlandengine.com/compare/playcanvas.
New Art City: newart.city, info.newart.city/about. Framer: framer.com/community/marketplace.
