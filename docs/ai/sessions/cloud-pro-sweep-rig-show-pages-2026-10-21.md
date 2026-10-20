## 2026-10-21 — rig tools and show pages: measured on four devices in a browser, the plot's touchpad and the S-sized majors fixed

- Pro sweep agent #27 (brief `docs/ai/cloud-briefs/2026-10-13-pro-sweep.md`), base `origin/dev`. Audit:
  `docs/ai/audits/2026-10-21-rig-show-pages.md`; rerunnable walk: `scripts/audit/rig-show-pages.cjs`
  (seeds one project, 8 pages × desktop DPR 1 / DPR 2 / phone / tablet, axe-core 4.13 WCAG 2.2 AA, target
  sizes, the Tab walk, the plot's touchpad and pinch, Perform's Escape). `@axe-core/playwright` 4.13.0 is a
  pinned devDependency now (it lifts the shared axe-core 4.12.1 → 4.13.0 that jsx-a11y also uses).
- This time the pages mounted in the cloud sandbox: serverXR on a throwaway `DATA_ROOT` with auth off, Vite
  proxying to it, Chromium from `/opt/pw-browsers`. Same script on `origin/dev` and on this branch: 83 / 43 →
  94 / 32 checks ok / FAIL; axe serious + critical nodes in this area's files 9 → 0 (66 → 56 over all pages; the
  rest are the rig bar, Raw's window frame, the tier mark and Inventory.jsx, all reported, none touched).
- Fixed, one commit and one red-then-green test each: the plot's two-finger scroll now pans with deltaX kept
  (`planWheel.js`), + − fit and + - 0 zoom without a wheel, Perform's menus close on Escape or a press outside,
  the patch sheet's table boxes take keyboard focus, beat dots role img, 44 px touch targets on the plot,
  24 / 44 px in Perform, the visualiser title's contrast, and a production name out of a placeholder.
- Still OPEN (in the audit, with sizes): Perform's VJ preset clips its windows on a phone (sev 3, M); the
  visualiser divider is 6 px; the scenes deck's "will sync" sentence promises a sync the page does not have
  (the owner's words); "room" / "desk" / "scenes" against the vocabulary; currency defaults to AMD.
- Not seen on a real phone, touchpad, Safari or screen reader: the owner's look on phone, touchpad and
  desktop is owed.
