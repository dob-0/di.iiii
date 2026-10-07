## 2026-10-07 — the nine event agents active, and the venue-show runbook (learn once)

Owner, 2026-10-07: "let's create agents and MCPs for this work" and "what we create, it learns, so in future we
don't spend credits doing the same". He gave the word to activate the event roles drafted on 2026-09-30.

- Branch `feat/event-agents-2026-10-07` from `origin/dev`, with `origin/docs/event-layers-agents-mcp` merged
  (docs only, clean merge).
- The nine draft roles moved from `docs/architecture/event-agents/` to `.claude/agents/` (venue-capture,
  hall-modeller, equipment-verifier, rig-planner, patch-planner, scene-writer, show-check, rental-and-paper,
  rigging-safety-checklist). The "DRAFT, not active" line is gone; every hard constraint of the drafts is kept.
  Each file gained "Today's rules": one show version per production, build from git, the archive script, the
  owner runs every server write (and a local write to a followed space is a dev write), no software-GL render
  and stop at 88 °C, one report to a file with an 8-line reply sent once, commit early. Each also points to the
  runbook, and most gained one line of MOXIR facts for their layer.
- Allowlists checked path by path with `git cat-file -e origin/dev:<path>`: every script named exists on dev
  except `scripts/rigbuild/policy-check*` (never built, EVENT_LAYERS §5), which is removed from rig-planner.
  `scripts/production/archive-versions.mjs` is NOT in any allowlist: it is on
  `feat/moxir-truss-flip-2026-10-07`, not on dev yet; the agents and the runbook say so.
- New skill `.claude/skills/venue-show/SKILL.md` (under 200 lines): the one-source-per-fact table, the command
  for each job (versions and `--check`, rig tests, copy, archive dry run / apply / undo, follow and audit,
  page push to dev as the hub, patch and paper, show clock), the agent per layer, the traps paid for (from
  TOOLS_MAP §3 and the MOXIR notes; no secrets, no personal data, no chat ids), and what is owed.
- Pointers to the runbook from `docs/architecture/EVENT_LAYERS.md` (status line, §2.0, §4, §5) and
  `scripts/rigbuild/README.md`.
- Checks: `npm run docs:ai:check` and `npx vitest run src/ai` (results in the PR body). Not run: any agent on a
  real job; nothing written to any server. The routing per agent (haiku / sonnet / opus) is a rule, not a
  measurement.
- Owed: the MCP side (read-only rig tools for the agent door) is on `feat/mcp-rig-tools-2026-10-07`, a
  separate branch; a first real run of each agent; the owner's look at this PR.
