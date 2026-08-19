# Model Routing — Which AI for Which Task

Burn the cheapest model that can do the job correctly. Use the most expensive only when correctness demands it.

---

## Tier Table

There is no local tier. Ollama was removed from every machine on 2026-08-05: the box that
held the models goes offline, which made the free fallback the least available thing in the
stack rather than the most. Cheap now means Haiku, not free.

| Tier | Model | Cost | Use When |
|------|-------|------|----------|
| 1 — Cheap | Claude Haiku | Low | Simple single-file edits, small test additions, obvious lint fixes |
| 2 — Medium | Claude Sonnet | Medium | Feature work, multi-file bugs, UI layout changes, node registry changes |
| 3 — Expensive | Claude Opus / Fable | High | Only: architecture decisions, non-negotiable reviews, security audits, cross-system refactors, full audits |

The main Claude Code session is **not pinned** in `.claude/settings.json` — it uses whatever the
user set as their default (`/model`). Per-task tiering happens through the subagents in
`.claude/agents/` (ux/qa → haiku, backend/viewport/nodes → sonnet, schema/security → opus) and
this table.

---

## Task → Model Quick Routing

```text
"What does X do?" / "Where is Y defined?"          → Haiku
"Write PROGRESS.md session entry"                  → Haiku
"Add a golden rule"                                → Haiku
"Explain why this bug happened"                    → Sonnet — root cause, not restatement
"Write tests for this utility function"            → Haiku
"Fix a lint warning in one file"                   → Haiku
"Add a small UI tweak (color, spacing)"            → Haiku
"Fix a layout bug (measured heights, insets)"      → Sonnet — layout precision required
"Add a new node type to the registry"              → Sonnet
"Add a backend API route"                          → Sonnet
"Refactor across 3+ files"                         → Sonnet
"Is this architectural decision safe?"             → Opus
"Review auth or security change"                   → Opus
"Change the op-log format"                         → Opus — non-negotiable territory
```

---

## Role → Recommended Model

| Role | Default Model | Escalate To |
|------|--------------|-------------|
| Technical Architect | Opus | — |
| UI/UX Engineer | Sonnet | Haiku for cosmetic-only |
| Node System Engineer | Sonnet | Haiku for trivial port adds |
| 3D/Viewport Engineer | Sonnet | — |
| Backend/API Engineer | Sonnet | Opus for auth changes |
| Schema/Protocol Engineer | Opus | — |
| Infrastructure Engineer | Haiku | Sonnet for new workflows |
| QA/Test Engineer | Haiku | Sonnet for complex test scenarios |
| Security Auditor | Opus | — |
| Documentation Engineer | Haiku | Sonnet for structured docs |

---

## Token Budget Per Task Type

Each role must stay within this tool-call budget. If you exceed it, stop and summarize what you found before continuing.

| Task type | Max file reads | Max grep calls | Max edit cycles |
|-----------|---------------|---------------|----------------|
| Q&A / analysis | 5 | 10 | 0 |
| Single bug fix | 4 | 5 | 2 |
| Small feature | 6 | 8 | 4 |
| New node type | 5 | 5 | 3 |
| CSS/layout fix | 4 | 4 | 3 |
| Backend route | 4 | 4 | 3 |
| Documentation | 3 | 3 | 2 |

**When you hit the budget:** stop tool calls, write what you know, ask if you should continue or if the remaining unknowns are acceptable.

---

## Startup Context Rules — Stop Loading Everything

The biggest token burn is agents loading everything at session start. The correct startup is:

1. Read `AGENTS.md` — one file, always (loaded automatically)
2. Read `PROGRESS.md` — one file, always
3. Read the nearest scoped `AGENTS.md` for the area you will edit — one file
4. Read your role card — one file
5. **Stop. Execute the task. Read more only if blocked.**

Do NOT pre-read: golden_rules.md, architecture.md, every component in the area, test files "just in case". Read them if the task demands it.

---

## Compound Tasks — Split Before Running

If a task crosses two roles, split it. Do NOT run one expensive session that touches everything.

```
Wrong:  "Refactor the node inspector and update the backend API"
        → one Sonnet session touching 10 files → expensive, risky

Right:  Task 1 (NSE/Sonnet): "Refactor node inspector sections"
        Task 2 (BAE/Sonnet): "Update the backend API for the new inspector shape"
        Each is smaller, cheaper, easier to review
```
