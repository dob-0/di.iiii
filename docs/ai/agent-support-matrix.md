# Agent Support Matrix

This page explains how the repo supports major agent ecosystems while keeping one canonical authoring model.

## Canonical Authoring Rule

- canonical authored docs: `AGENTS.md` plus `docs/ai/`
- generated bridge files: vendor-native entrypoints
- goal: wide tool compatibility without maintaining five divergent instruction systems by hand

## Matrix

| Tool family | Versioned repo entrypoints | Scope model | Local/private overrides |
| --- | --- | --- | --- |
| Open `AGENTS.md` ecosystem | `AGENTS.md` files at root and scoped directories | nearest `AGENTS.md` should win | tool-specific user memory or local files outside canonical docs |
| Claude Code | generated `CLAUDE.md` files that import sibling `AGENTS.md` | hierarchical `CLAUDE.md` loading by directory | `CLAUDE.local.md`, user `~/.claude/CLAUDE.md`, or org-managed Claude files |
| Gemini CLI | generated `GEMINI.md` files that import sibling `AGENTS.md` | hierarchical `GEMINI.md` loading and JIT subtree context | user `~/.gemini/GEMINI.md` and Gemini settings |
| GitHub Copilot | generated `.github/copilot-instructions.md` plus `.github/instructions/*.instructions.md` | repo-wide plus `applyTo` path-specific instructions; AGENTS may also be used by agents | user/home Copilot instructions outside repo |
| Cursor | generated `.cursor/rules/*.mdc` plus `AGENTS.md` fallback | always-on repo rule plus path-scoped rules | Cursor user rules and local editor settings |

## Why This Split Exists

- `README.md` stays human-first
- `AGENTS.md` stays concise and predictable
- deeper reference moves into `docs/ai/`
- generated bridge files let multiple tools enter the same knowledge system without duplication

## Maintenance Commands

```bash
npm run docs:ai:sync
npm run docs:ai:check
```

If these commands disagree with committed bridge files, the canonical docs changed and the generated layer needs refresh.
