# fix/agent-tools-field-2026-10-09

## What and why

Owner, 2026-10-09 (ledger N437): route each model by task and work by a strict, published method. While checking the 11
role agents in `.claude/agents/`, every one used `allowed-tools:` in its frontmatter. That key belongs to skills. For
sub-agents the key is `tools`, and "Claude Code ignores a field it doesn't recognize without reporting an error"
(https://code.claude.com/docs/en/sub-agents, read 2026-10-09). So every limit was silently ignored and every role got
every tool. That included the read-only auditors (`security`, `release-verifier`, `silent-failure-hunter`,
`human-verifier`), which could edit.

## Change

- `allowed-tools:` → `tools:` with tool names only. Read-only roles: `Read, Grep, Glob, Bash`. Editing roles:
  `Read, Grep, Glob, Edit, Write, Bash` (what they effectively had already, so their behaviour does not change).
- The Bash commands each role meant to run are now one written line in its body. `tools` cannot narrow Bash; settings
  `permissions` do that (same docs page).
- `qa`: `haiku` → `sonnet`. It is the role that verifies "a task is provably done". The routing standard
  (di-atlas `agents/ROUTING.md`) never puts a verifier below the executor's tier, and the executors here run on Sonnet.
- New guard `scripts/check-agent-frontmatter.test.js`: only documented keys, a known model, `tools` without patterns,
  and no Edit/Write on read-only roles. Measured: 38/38 pass on this branch; on the old files from `origin/dev` 15 fail
  (11 unknown keys and 4 read-only roles with edit rights).

## Owed

- Narrowing Bash per role needs `permissions.deny` rules. That is a separate change for the owner's review.
