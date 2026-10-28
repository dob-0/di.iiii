## 2026-10-28 — event agents folded into the venue skills (owner N1356: fold, do not add beside)

- The nine event agents and the `venue-show` runbook of 10-07 are dropped from this branch; dev's venue skill family stays the one home.
- What dev lacked went into `docs/ai/skills/venue-to-show.md` §7 (capture/consent, gear check, patch, paper and rentals, rigging safety packet, looks and
  surface check, extra traps, and the standing rules: one show version, owner runs server writes, no software GL) with three pointer skills
  `venue-gear-check`, `venue-paper`, `venue-safety-packet` (README rows added).
- `docs/architecture/EVENT_LAYERS.md` kept (dev has no equivalent); its pointers and `scripts/rigbuild/README.md` now name the venue skills.
- Docs and skills only. Tests: see the PR. Not done: no agent ran a real job; the MCP side stays on `feat/mcp-rig-tools-2026-10-07`.
