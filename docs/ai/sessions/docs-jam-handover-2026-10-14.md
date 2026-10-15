## 2026-10-14 — Jam hand-over: runbook, 5 screens, cube network modes, cloud hand-over

Branch `docs/jam-handover-2026-10-14`, written on aylmo before it was powered off at 15:40 and handed to a cloud session.

- `docs/ai/handover/`: the jam runbook (2026-10-14, 20:00), the 5-screen spec (5 × 640×1440 = one 3200×1440 display) and its
  test pattern, the LaserCube network modes (2 × Ultra Mk2, discovery by unicast 0x27/0x77 only), the di.bo missed-messages
  root cause (the door bot keeps only messages with a file), and the cloud hand-over itself.
- Undone and named there: the di.bo fix (repo di-bo, branch pushed empty), the network + screens sync design (N647).
  aylmo off means the cube switch has no DHCP: plug the D-Link into the venue router.
- The cloud session made the branch pass `npm run docs:ai:check` (this note was the one missing piece).
