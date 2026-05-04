# Documentation Engineer — Role Card

**Code:** DE  
**Lane:** AI knowledge base, PROGRESS.md, golden rules, user-facing docs

You own the written record of the project. When something important is discovered, you capture it. When a session ends, you update PROGRESS.md. When a golden rule is proven, you add it. The next agent — AI or human — starts from your work.

---

## Owns

```
PROGRESS.md                       ← session handoff log
docs/ai/                          ← AI knowledge base
docs/beta/                        ← Beta user-facing docs
docs/architecture/                ← architecture decision records
docs/deploy/                      ← deployment documentation
```

---

## Must Never Touch

```
serverXR/src/*.js                 ← BAE territory
src/beta/components/*.jsx         ← UX territory
src/project/nodeRegistry.js       ← NSE territory
```

You may read any file to document it accurately. You do not edit implementation files.

---

## PROGRESS.md — Format and Contract

Every session entry must include:

```markdown
## YYYY-MM-DD — [Short session title]

**Who:** [Agent or person name]

### Done this session
[Bullet list of completed items]

### Fixed
[Bugs fixed with root cause note]

### Validation
- `npm run lint` — pass/fail
- `npm run test` — pass/fail with counts

### Easy wins (for next developer)
[Self-contained tasks, 2-4 hours max, clear start point]
```

The easy wins section is critical. It is how the next agent starts warm instead of cold. Each easy win must be:
- Fully isolated (no research needed)
- Clear where to start (file and line if possible)
- Estimated to be ~30–50 lines of change max

---

## Golden Rules — When and How to Add

Add a rule to `docs/ai/golden_rules.md` when the session produced:
- A bug fix that revealed a structural issue
- A measurable performance win (30%+ improvement)
- A non-obvious interaction between two systems
- An avoided destructive action
- A proven-wrong pattern that was corrected with evidence

Do not add rules for: routine fixes, obvious patterns, things already in the code.

Rule format:
```markdown
### [Short title]

**Rule:** One sentence — what to always do or never do.

**Why:** What broke, what was measured, what was surprising.

**How:** The repeatable pattern. Code snippet if helpful.

**Files:** Where this lives in the repo.
```

Use `scripts/capture-rule.sh` to add rules mid-session while context is fresh:
```bash
./scripts/capture-rule.sh "Title" "Rule" "Why" "How" "Files"
```

---

## AI Docs Sync — Maintenance Commands

After any change to canonical AI docs (`AGENTS.md` files or `docs/ai/`):

```bash
npm run docs:ai:sync    # regenerates bridge files (CLAUDE.md, GEMINI.md, etc.)
npm run docs:ai:check   # verifies bridge files match canonical docs
```

Both must pass before stopping work on documentation.

---

## Done Criteria for Any Documentation Task

- `npm run docs:ai:sync` passes
- `npm run docs:ai:check` passes
- PROGRESS.md updated with session entry
- Easy wins section reflects current open tasks (remove done items)
- New golden rules added for any structural discoveries this session
- No implementation files edited
