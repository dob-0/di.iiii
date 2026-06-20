# Agent Operating Contract (deep reference)

The full process contract for AI agents in `di.iiii`. `AGENTS.md` carries the compressed,
always-apply version of these rules; read this file when you need the long form or the rationale.

## Universal Startup Contract (All Models)

Applies to all agent entrypoints in this repo (Claude, Gemini, Copilot, Cursor, and AGENTS-native readers).

At project open:

- read root `AGENTS.md` first
- read `CURRENT.md` immediately after — it points to the known-fixes table and prevents re-doing solved work
- read the nearest scoped `AGENTS.md` before edits
- use `docs/ai/index.md` only for deeper reference

During active work:

- follow Default Task Mode and the AI Task Contract below
- emit the required progress status bar updates
- keep responses scoped, concise, and validation-backed

## Default Task Mode

Apply this by default unless the user says otherwise:

- ask at most 2 clarifying questions
- if the prompt or command is short, ambiguous, or under-specified, pause, think, and ask the smallest clarifying question before editing files or taking irreversible action
- lock scope to declared files/systems
- do the highest-priority item first
- avoid optional extras unless requested
- end with: summary, changed files, validation, unresolved risks

Progress status bar (required during active work):

- format: `status | phase X/Y | XX% | current | next`
- update every 3 to 5 tool calls or after each meaningful edit batch
- keep each update to one line unless a blocker appears
- if blocked: append `| blocked: <reason>` and request the smallest missing input

## AI Task Contract (Required)

Before acting on a task, lock these fields in order:

- goal: one exact outcome
- priority: ordered list, highest first
- scope: allowed files and systems
- non-goals: what must not be changed
- output: expected format and length
- done criteria: objective checks

If any field is missing and the task can cause broad or destructive edits, ask for clarification before changing files.

Strict execution rules:

- ask at most 2 clarifying questions, then proceed with the safest bounded interpretation
- do not silently expand scope beyond declared files/systems
- if requested scope is broad, propose a narrowed scope first and wait for confirmation
- report only task-relevant findings; defer optional ideas unless asked
- always end with: changed files, validations run, unresolved risks

## MCP / Tool-Usage Guardrails

- use the minimum number of tools needed to satisfy the goal
- avoid broad scans when a scoped file read/search is enough
- avoid edits outside declared scope
- after every 3 to 5 tool calls, summarize what was learned and what is next
- if tool output conflicts with the task request, stop and resolve the conflict before proceeding
- if a tool action is expensive or potentially destructive, confirm intent first

## Response format contract

- summary: 2 to 4 lines max
- changes: file list with one-line reason each
- validation: exact commands and pass/fail
- risks: only concrete unresolved items

## Canonical AI Docs

- `AGENTS.md` files are the canonical short routing layer
- `docs/ai/` is the canonical deep-reference layer
- generated bridge files exist for Claude, Gemini, Copilot, and Cursor
- keep shared instructions in `AGENTS.md` and `docs/ai/`, not in tool-native bridge files
