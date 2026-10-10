## 2026-10-07 — The XR production cycle: a design document, read-only

- New: `docs/architecture/XR_PRODUCTION_CYCLE.md`. The full cycle of an XR / live-show production, stage by stage (capture → place model → picture → items → design → the full map → patch and network plan → rehearse → get-in → one-click connect → show → strike → re-capture), each with input, the one source file, the tool that exists (path) or MISSING, the check, and who.
- Builds on `EVENT_LAYERS.md` (origin/docs/event-layers-agents-mcp; roles activated in PR #808), `docs/moxir/TOOLS_MAP_2026-10-05.md` (commit 88261e7e) and `RIG_BUILD.md`. Does not repeat them and does not edit them.
- "One click" made real: an address plan file, a known-MAC identity check (RDM later: no RDM code exists, CONFIRMED by grep), `connect.mjs` with a red/green list (NEW), fallbacks; standards named (ANSI E1.20, E1.31, Art-Net 4, DIN SPEC 15800/15801, ILDA IDN, IEC 60825-1) with the ones not opened said so.
- The picture parameters: where each lives today (six places, CONFIRMED in RIG_BUILD §23 and the rig file's `night` block) and the one `picture` block they should live in.
- Scanning via di.bo: what exists (scan page, build route, 15-min inbox pull timer) and the smallest path; the footage is the limit.
- MOXIR now: the hand-made workarounds named with their fixes, the order of work 10-07 → 10-17, the site-visit capture list for 10-08.
- Added on the owner's three asks the same night: two picture modes (Operate new, Lite and Full exist and are measured), fast fixture placement (Keep / Discard into the versions file; agent moves through `rig.version.propose`), and generated agents / skills / md with a drift check.
- Owner summary written to the session scratchpad (`xr-cycle-summary.md`).
- Not done: nothing built, no server written to, no render run; the parallel branches `feat/moxir-site-survey-2026-10-07` and `feat/mcp-rig-tools-2026-10-07` were not on origin when this was written.
