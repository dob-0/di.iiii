# chore/moxir-quick-change

## What and why

Owner, 2026-10-09: moxir work burns too many credits; "when I want to change a light place … it starts to
build for hours". Measured from the session logs (`~/.claude/projects/*/*.jsonl`, 10-07 to 10-09): the
moxir sessions used 240–650 M tokens each, and the largest ran 1,537 turns at ~425 k tokens of context
per turn with 24 sub-agents. The cost is long sessions and fan-out, not the edit. A rig light is data
(`scripts/place/rigs/*.json`), and `rig.mjs` writes it as ops in 0.28 s (dry run, measured).

## Changed

- `.claude/skills/moxir-quick-change/SKILL.md`: the quick lane. A budget of 12 tool calls with no
  sub-agents in a fresh Sonnet session; the rig-file path (A) or the one-object path (B); one picture;
  a stop line when the change is really code.
- `.mcp.json`: the `di` MCP server (`di mcp --port 5335`). Tested: `di_find` returns
  `post_projects_ops`.

## Owed

- `di mcp` defaults to port 4000 (`fetch failed` on aylmo, whose install serves on 5335), so it should
  find its own install's port. The 5335 in `.mcp.json` is a workaround.
- The local `moxir-v1-1` is empty on aylmo (0 entities, ledger N374.2), so path A or B for v1.1 could
  not be checked here.
- A first real light move through the skill is not yet timed (tokens and minutes).
