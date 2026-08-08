# feat/admin-minimal — session notes

## 2026-08-08 — Ops Graph minimal pass: 10 sections → 6, contextual header

- Owner's call ("admin is messy, make minimal"): diagnostics collapsed from seven
  sections to three — Overview stays, **Inspect** absorbs Topology + Objects +
  Session, **System** absorbs Console + Controls + the old System. Admin group
  unchanged (Manage, Open Call, Agents). Nothing was removed — every module still
  renders, just grouped.
- Contextual topbar: on admin sections the scene-editor telemetry (Objects/Visible/
  Selected/Hidden, Copy Snapshot/Log/Links, XR Debug) disappears; instead Manage and
  Open Call show Spaces/Users counts, Agents shows Live/Sessions counts, both fed
  upward via tiny `onStats`/`onBoardStats` callbacks — no fetch lifting. Diagnostics
  sections keep the full telemetry header.
- Overview's "Open Console" jump retargeted from the removed `console` key to
  `system` — grep for `setActiveSection('` if sections are ever renamed again.
- No new CSS, no restyling; PreferencesPage.test.jsx navigation updated to the new
  section names in the same change.
