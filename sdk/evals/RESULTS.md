# Evaluation results — the agent door

`sdk/evals/di.xml` (10 read-only questions), run with `sdk/evals/run.mjs`
through Claude Code 2.1.281, model `sonnet`, built-in tools off, only the di.iiii
MCP server loaded. Server: this branch's serverXR on a snapshot copy of the local
tier (2026-09-24 05:39 +04, blobs left out), auth on, admin token.

| | old `sdk/mcp.mjs` (origin/dev) | new, first run | **new + pick** |
|---|---|---|---|
| correct | 6/10 | 9/10 | **9/10** |
| tool calls | 89 | 209 | **75** |
| input tokens (incl. cache) | 1,228,274 | 6,886,496 | **1,237,982** |
| output tokens | 40,408 | 147,464 | **20,586** |
| cost, as Claude Code reports it | $1.49 | $4.22 | **$1.05** |
| wall time, 3 in parallel | 504 s | 1,854 s | **253 s** |
| `tools/list` before any question | 17 tools, 7,088 B | 4 tools, 3,303 B | **4 tools, 3,685 B** |

## What the numbers say

- **The old server** could not reach a space's scene at all, so it failed the
  scene questions — twice by answering a confident, wrong `0`.
- **The first new run** answered them, but by re-reading 60 KB scene documents
  past the 24k-character answer cap, 22–60 calls each. More capable, 2.8× the
  cost: the opposite of the goal.
- **`pick`** (only the fields asked for reach the model) took it to fewer calls
  than the old server, the same token volume, 30% lower cost and half the time,
  with 9/10 correct.

## Limits, stated

- **One run per condition.** Model variance is not measured; a second run of the
  same condition could differ by a question or two.
- The miss in the last run (q7: 12 for 13) counted only 3D text; the door
  returned both kinds.
- The user's global instructions and memory load in every run (`--bare` would
  drop them, and the sign-in with them). They are the same for all three.
- Token counts come from Claude Code's result events, not the Anthropic
  token-counting endpoint (no API key on this machine).

Raw reports (per-question calls, tokens, answers) were kept in the session
scratchpad; rerun to reproduce — answers hold only for that snapshot.
