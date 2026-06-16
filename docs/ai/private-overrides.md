# Private Overrides Guide

This page defines what belongs in checked-in AI docs versus local overrides.

## Checked-In AI Docs Must Stay Public-Safe

Allowed in versioned AI docs:

- project structure
- commands and validation flow
- architectural boundaries
- branch and release model
- high-level deploy ownership and artifact shape

Do not store in versioned AI docs:

- secrets
- tokens
- private host paths
- personal SSH targets
- private sandbox URLs
- machine-local notes or one-off operator reminders

## Local Override Locations

- Claude Code
  - `CLAUDE.local.md` for repo-local personal overrides
  - `~/.claude/CLAUDE.md` for user-wide overrides
- Gemini CLI
  - `~/.gemini/GEMINI.md`
  - Gemini settings for alternate context filenames
- GitHub Copilot
  - personal/home Copilot instruction files outside the repo
- Cursor
  - Cursor user rules and local editor settings

## Repo Ignore Policy

This repo ignores:

- `CLAUDE.local.md`
- nested `CLAUDE.local.md` files

That keeps personal Claude overrides available without polluting the canonical repo docs.

## Writing Rule

- if everyone on the project needs it, put it in `AGENTS.md` or `docs/ai/`
- if only one person or one machine needs it, keep it in a local override
- if a tool-native bridge file needs a change, edit the canonical docs and regenerate the bridge instead of hand-editing the generated output
