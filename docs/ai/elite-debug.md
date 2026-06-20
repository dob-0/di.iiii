# Elite Debug & Investigation Methodology

Rules for how to think when working in this codebase — and in any codebase.
Not repeated from `golden_rules.md` or `agent-operating-contract.md`. This is the layer beneath the process: the epistemology.

---

## The Core Law

**Fix the root. Never the symptom.**

Every fix that targets a symptom creates two problems: it hides the root, and it introduces a workaround that the next person has to understand. If you can explain WHY the bug exists in one sentence without using the word "because of the symptom," you haven't found the root yet.

Applied here: the gizmo overlap was fixed twice at the wrong layer (cluster position, cluster max-width) before the actual cause was found (`AccountButton` at `z-index: 9999` in an unrelated DOM subtree). Two commits, zero progress. One grep — done.

---

## Investigation Rules

### 1. Grep before you reason

Before forming a hypothesis about what's broken, search for the exact string.

```bash
grep -rn "account-btn\|zIndex.*9999\|z-index.*9999" src/
```

The answer is almost always already in the codebase. You are looking for it, not inventing it.
Forming a hypothesis first biases every subsequent search. Read first. Theorize after.

### 2. Own the coordinate system before you touch positions

Every visual bug involving overlap has a coordinate system mismatch at its core.

Before moving anything, answer:
- Is this element `position: static | relative | absolute | fixed | sticky`?
- What is its nearest positioned ancestor?
- What stacking context owns it?
- What is its z-index relative to the element it conflicts with?

`position: fixed` elements have **no positioned ancestor** — they are positioned relative to the viewport. `overflow: hidden`, `transform`, `clip-path` on any ancestor do not constrain them. They are global. Treat every `position: fixed` element as a potential overlay on every pixel of the screen.

### 3. Trace ownership, not location

When something is broken, your instinct is to look at the file where the symptom is visible. The fix is almost always in the file that OWNS the broken behavior — which is often a different component entirely.

**Location** = where you see the problem.  
**Ownership** = who decides the behavior that causes it.

The gizmo was at `StudioViewportLayout.jsx`. The fix was in `AuthGate.jsx` + `RootApp.jsx`. Nothing in `StudioViewportLayout.jsx` needed to change.

To find ownership: trace upward (parent components, providers, wrappers) until you find who controls the state or style in question. Then fix there.

### 4. Read the pixel

When you have a screenshot and a hypothesis, verify the hypothesis numerically.

```python
img.crop((w - 120, 0, w, 100))  # crop the exact conflict area
```

If you calculate that element A (right: 14) and element B (right: 10) are 4px apart — and the screenshot shows them overlapping — your model of the layout is wrong. Update the model. Don't ship the fix until the numbers match what you see.

### 5. One unknown at a time

When you have multiple possible causes, eliminate them in sequence. Do not change two things at once. If you change `cluster x` AND `cluster max-width` in the same commit and the bug persists, you now have no information about whether either change did anything.

Change one variable. Test. Then change the next.

### 6. A bug that survives a hard refresh is not a cache problem

HMR (hot module reload) does NOT reset `useState`. But a full browser refresh does. If the bug survives a hard refresh (`Ctrl+Shift+R`) in two separate browsers, it is in the code — not the cache, not the browser state, not the dev server.

Stop suggesting cache clears. Fix the code.

---

## Non-Repeating Practices

### Never repeat a tool call

If you've read a file, you've read it. If you've grepped for a string, you know the result. Do not re-read or re-grep to "double-check." Trust what you found. If the result seems wrong, the model is wrong — update the model, don't repeat the call.

Repeating tool calls is the agent equivalent of spinning. It signals either distrust of your own findings or confusion about the model. Stop, state what you know, state what's inconsistent, resolve it.

### Never re-investigate a known fix

`CURRENT.md` → `docs/ai/known-fixes.md`. Every solved problem is documented. Reading them costs one tool call. Re-investigating costs 20+. Any agent who re-investigates a documented fix is consuming real resources for zero value.

**The test:** before you start any investigation, read `CURRENT.md`. If the symptom matches a row in the known-fixes table, apply the documented fix. Stop.

### Never explain what the code does — read it

When you don't understand a piece of code, read it. Don't reason about what it probably does from its name, its imports, or its callers. Read the function body. Read the CSS property. Read the SVG path.

In this session: the `AccountButton`'s login SVG looked like "→" to the user. I knew it looked like "→". I did not know WHY until I read the SVG paths (`M10 17l5-5-5-5` + `M15 12H3` = right-pointing chevron + horizontal line = login arrow icon). Reading confirmed the model. Guessing would have not.

---

## The DRY Principle at the Architecture Level

DRY (Don't Repeat Yourself) is usually taught as "don't copy-paste code." That's the surface. The deeper version:

**Every fact should have one owner. Every behavior should have one source of truth.**

In this codebase:

| What | One owner |
|------|-----------|
| Auth session | `useAuthSession.js` |
| Account button rendering | `AuthGate.jsx` |
| Studio editor layout | `StudioShell.jsx` |
| Gizmo position | `.svl-gizmo-wrap` in `studio.css` |
| Which routes are studio | `studioRouting.js` |

When two systems fight over the same visual space, it's because one owner didn't know the other existed. The fix is always: pick one owner and remove the other's concern.

`AccountButton` was "owned" by every page that used `AuthGate`. But the studio editor has its own nav. The fix: transfer ownership — studio editor opts out, `AuthGate` respects it.

---

## What Elite Looks Like in Practice

**Elite is not about speed. It is about non-repetition of effort.**

A session that takes 30 minutes and produces one correct commit is better than a session that takes 2 hours and produces three partial commits that don't fix the bug.

The markers:

| Average | Elite |
|---------|-------|
| Reads files hoping to find the answer | Knows what to grep for before reading |
| Tries things to see what happens | Forms a model, verifies the model, changes exactly what the model says |
| Fixes the visible element | Finds who owns the behavior |
| Changes two things, tests both | Changes one thing, tests it, then the next |
| Re-investigates known bugs | Reads `CURRENT.md` first |
| Explains the fix in comments | Names the thing correctly so the fix is self-evident |
| Asks what changed | `git log --oneline -10` |

**The bottleneck is almost never typing speed. It is always model accuracy.**

The model is your understanding of the system. The more accurate your model, the fewer tool calls you need, the fewer wrong fixes you ship, the fewer commits it takes. Invest in the model before you invest in the fix.

---

## Adding to This Document

Add a section here when you discover a **thinking pattern** — a way of approaching a class of problem — not just a specific solution. Specific solutions go to `golden_rules.md`. Thinking patterns go here.

The test: "Would this change how I approach the NEXT problem of this type, even in a different codebase?" If yes, it belongs here.
