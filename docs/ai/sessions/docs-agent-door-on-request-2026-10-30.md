## 2026-10-30 — The agent door on request: design only (ledger N1544)
- Wrote `docs/ai/agent-door-on-request.md` (the flow, what may be asked and what never, the change list, rollback, the §6 text, cost) and `docs/ai/decisions/2026-10-30-agent-door-on-request.md`.
- Measured on origin/dev 73539b090: the catalogue has 247 routes, 115 read, 112 private, 20 public; 5 of the 20 are already refused by the di.bo and root lists.
- Read: SPEC_agent_door.md §6, CLI_LOGIN.md, cliTokenGate.js, approvalGate.js, pendingActionStore.js, followRoutes.js, spaceRoutes.js (spaces.patch), index.js (reauthorisers, decision route); di-bo origin/master bot.mjs approvals and lib/proposals.mjs.
- Found: the decision tap is root-only in di-bo, so phase 1 is approved by the owner for every person; the follower side needs a console on that install.
- Code: none. Tests: none run (docs only). Next: the owner's look, then the serverXR PR behind `CLI_DOOR_ON_REQUEST`.
