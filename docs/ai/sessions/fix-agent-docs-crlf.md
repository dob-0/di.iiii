## 2026-09-29 — the docs check passes on a Windows checkout

- Emilya's agent found every push from ponyo refused once #612 put the push checks in a git hook:
  `docs:ai:check` read the CRLF checkout (core.autocrlf=true) raw — every bridge "out of sync", every
  SKILL.md "missing YAML frontmatter".
- `toLf()` (sync-agent-docs.mjs): check-agent-docs reads every file through it and compares the
  generated text without line endings; sync-agent-docs compares the same way (and writes LF).
- Guard: `scripts/check-agent-docs.crlf.test.js` makes a worktree of HEAD, turns every .md/.mdc CRLF,
  runs the real checker — failed on the old scripts, passes now.
