## 2026-09-03 — the third route stops being grey on grey

- "Open Jam" sat in the landing's hero between two legible buttons and could not be
  read: muted white on a transparent ground, with the room's near-white walkable slab
  drifting behind it. Measured against that slab it was 1.10:1.
- Both outlined routes in `.lp-hero-cta-row` now carry their own dark scrim. The ghost
  treatment is unchanged everywhere else on the page — the fault was the transparent
  ground under a live 3D backdrop, not the treatment itself.
- The contrast suite had passed this for weeks because every case composited against
  black, which is the page's ground and not the hero's. The new guard composites each
  hero route's declared background over **white** instead, and was watched failing at
  1.10:1 with the scrim taken out.
- Looked at both widths on local before and after: 1440x900 and 390x844.
