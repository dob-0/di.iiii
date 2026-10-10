## 2026-10-11 — Claude Code setup audited against Anthropic's published practice and fixed

- Why: the owner asked for Claude Code to be "set well" for di.iiii after a day in which 99.96 % of 1.64 B tokens
  was re-read context. Method: Anthropic's best-practices and memory docs (code.claude.com/docs/en/best-practices,
  /memory): keep CLAUDE.md short, cut lines whose removal would not cause mistakes, hooks are deterministic while
  CLAUDE.md is advisory, subagent frontmatter uses `tools:`, path-scoped rules for part-of-codebase instructions.
- Findings: `AGENTS.md` mandated per-session reads of `CURRENT.md` (already injected by the SessionStart hook), a
  role card and, via the scoped bridges, `PROGRESS.md` (1.1 MB); all 11 `.claude/agents/*.md` used `allowed-tools:`
  (the commands key, ignored for agents); `settings.json` allowed `git stash *`, `node *`, `npx *` and two stale
  `/home/nooo` commands and enabled MCP servers that `settings.local.json` disabled; `settings.local.json` was
  tracked-adjacent (not ignored), pinned `fable[1m]` and allowed `pkill -f`; `/live`, `/stack` and the run skill
  still said `npm run dev`, `localhost:5173` and `docker ps` against the di-dev / `diiii.localhost` hard rules.
- Fix: AGENTS.md rewritten (121 → 113 lines, 10.1 → 9.3 kB) with grep-not-read rules, a "Local Run (aylmo)"
  section and a compaction-preserve line; agents `tools:`; settings allow-list 44 → 39, MCP enable block removed
  (disabled list kept); `.claude/settings.local.json` ignored; `/live`, `/stack`, run skill on di-dev and
  `*.diiii.localhost`; sync template tells bridges to grep PROGRESS.md / known-fixes.md, never read them whole.
- **Measured:** fresh-session base context, same-minute A/B (`claude -p` haiku, input+cache tokens): origin/dev 38,276 → this branch 39,010 (+1.9 %); +633 of that is the 11 agents now declaring `tools:` (the restriction was ignored before), +101 the doc/settings changes. Not a reduction; the removed per-session reads (CURRENT.md re-read, role card, whole PROGRESS.md/known-fixes) are measured only as rounds × context over the coming week. Report: `~/work/agent-reports-2026-10-11/claude-setup-audit.md`.
  in `~/work/agent-reports-2026-10-11/claude-setup-audit.md`.
- Undo: `git revert` of this branch's commit; the two untracked originals are in `~/di-backups/di.iiii-settings*.2026-10-11`.
