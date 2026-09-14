## 2026-09-14 — picture operators in Raw, and one desk across two machines (asuz + aylmo)

Carries the note for the stacked #445 (di two-installs fixes) and #446 (map motion glow),
which landed through the batch without their own.

- **Two real installs, one space.** Installed the latest di.iiii on asuz (Debian 13, no node,
  no curl) and followed its space from aylmo (certificate on 443). Five faults only two real
  machines showed — vendored npm on update, CLI self-requests to :80 on a 443 install, invite
  printing localhost, the follower speaking http to its own https server, follows only starting
  at boot, update/restore leaving a padlocked install down. All fixed with guards; rows in
  `docs/ai/known-fixes.md`.
- **Projector box.** asuz drives an Optoma 1080P over HDMI through `cage` + `chromium` +
  `seatd` (hand-started kiosk, no boot unit — autostart is the owner's call). The mode mark was
  being projected around the work; `/map/…/out` no longer draws it.
- **Motion glow** on a camera map surface (#446), then generalised: **picture operators** —
  Camera In, Difference, Level, Blur, Edge, Feedback, Blend, Analyze, Picture Out — one table in
  `src/project/tops/topOperators.js`, a WebGL1 engine, live pictures on the cards, Analyze →
  numbers through liveOutputs, map surface source "Pictures".
- **One desk across machines** (owner: "di is the join of desks"). `serverXR/src/machines`: a
  lasting machine id/name, a per-space hub of open pages with their devices, signal relay over
  the follow link. Browser: Runs on per operator; wires crossing machines are WebRTC video,
  remote cards get JPEG previews, numbers ride a data channel. The Desk panel node lists every
  machine and its cameras / mics / speakers / screens and places Camera In / Picture Out for a
  device. Seen end to end: asuz's camera analysed on aylmo, back on asuz's projector.
- **Still undone:** Send / Receive operators for SEPARATE desks (owner wants both modes);
  numbers wired into operator settings; sound operators for the listed mics/speakers; a
  machine only takes part while a page is open on it; two installs restored from one backup
  share a machine id.
