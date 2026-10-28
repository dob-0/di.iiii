## 2026-09-30 — event layers, draft agent roles and the MCP surface for repeating a venue job

- Docs only, no code: `docs/architecture/EVENT_LAYERS.md` sets out the eleven layers of a venue job (brief to on-site), each with its inputs, outputs, today's script or surface, the checker, what is missing and who signs off. It marks which layers a machine can check and which only a person on the real surface can, and it designs the owner's new policy layer (rig policy as tests, with explicit dated waivers).
- Nine draft agent definitions under `docs/architecture/event-agents/` in the `.claude/agents/` format, nothing placed in `.claude/agents/`. Each names tier, write scope, what needs the owner's word, model routing, a tool-call cap and the failure modes seen in this project.
- The MCP surface is designed as catalogue entries reached through the existing four door tools, with read, propose and apply phases; what the agent door already gives and what is new is listed. Nothing built.
- Claims not confirmed by reading a file are marked UNVERIFIED in the document. `npm run docs:ai:check` is the only check run. Not seen by the owner yet.
