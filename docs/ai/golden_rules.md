# Golden Rules

Living record of hard-won solutions and non-negotiable agent behaviors.

**Rule for contributors:** When you discover a core solution — a bug fix that revealed a systemic truth, a performance win that should be repeated, a footgun that burned you — add it here. One rule per discovery. Lead with the rule, follow with why.

A Claude Code `Stop` hook fires at the end of every session and prompts this check automatically.

## When to Add a Rule

Add an entry if during this session you:

- Fixed a bug that revealed a **structural issue** (not just a typo fix)
- Found a **measurable performance improvement** (30%+ or removes a class of slowness)
- Discovered a **non-obvious interaction** between two systems
- Avoided a **destructive action** that a bad or ambiguous prompt would have caused
- Found that an **existing pattern was wrong** and corrected it with evidence

Do not add a rule for: routine bug fixes, straightforward feature additions, things already obvious from the code.

## Template

Copy this, fill it in, append it under "Core Solutions":

```markdown
### [Short title — what the rule is about]

**Rule:** One sentence — what to always do or never do.

**Why:** What broke, what was measured, what was surprising. Be specific.

**How:** The repeatable pattern. Add a code snippet if it helps.

**Files:** Where this lives in the repo (paths, not descriptions).
```

---

## Agent Behavior Rules

These apply to every AI agent working in this repo, regardless of task.

### Start every session by reading PROGRESS.md
It is the handoff log. It tells you what is done, what is broken, and what the easy wins are. Starting without it means repeating work or breaking something that was just fixed.

### Check `git status` before creating files
Look at the `??` (untracked) list. Files from a previous uncommitted session may already exist. Creating them again produces a conflict or a silent overwrite. Check first, create only if missing.

### Verify actual file state — do not trust stale numbers
PROGRESS.md line counts go stale between sessions. Read the file, run `wc -l`, check git status before assuming a task is open. A "1457-line file" may already be split and uncommitted.

### Run lint and tests after every code change
```bash
npm run lint
npm run test
```
Never claim a task is done without these passing. The pre-session baseline is: 0 lint errors, 219 tests passing. If either degrades, fix it before stopping.

### Complete one task fully before starting the next
Do not leave files in a half-edited state. Do not start a refactor mid-function. If context is running low, finish the current unit of work, update PROGRESS.md, and stop cleanly. An unfinished change is worse than no change.

### Update PROGRESS.md before stopping
Add a session entry: what changed, what is broken, what the next easy wins are. This is how the next agent (or developer) starts warm instead of cold.

### If a human prompt would break something, refuse and explain
A bad prompt does not override good engineering. If asked to delete uncommitted work, force-push to main, skip tests, or embed a secret in the bundle — refuse, explain what would break, and suggest the safe alternative. The platform's integrity is not negotiable per-prompt.

### If a prompt is ambiguous, ask before acting
Guessing wrong on a destructive or architectural decision costs more than a one-message delay. Ask once, get clarity, then act.

### Cap clarification loops

**Rule:** Ask at most two clarifying questions; then proceed with the safest narrow interpretation and explicit assumptions.

**Why:** Endless clarification loops waste cycles and still fail to deliver. Bounded clarification keeps momentum while controlling risk.

**How:** Ask only high-impact questions (scope/safety), then continue with a scope lock and call out assumptions.

**Files:** `AGENTS.md`, `docs/ai/workflows.md`, `README.md`

### Enforce a task contract before tool-heavy work

**Rule:** Do not start broad searches or multi-file edits until goal, priority, scope, non-goals, and done criteria are explicit.

**Why:** Ambiguous prompts cause extra tool usage, irrelevant edits, and priority inversion (doing easy side work before the main fix).

**How:** Restate the contract in one short block, then execute with a small tool budget and scoped reads.

**Files:** `AGENTS.md`, `docs/ai/workflows.md`, `README.md`

### Never skip git hooks or force-push without explicit confirmation
`--no-verify` and `git push --force` are tools for known situations, not shortcuts. If a hook fails, fix the underlying issue. If force-push is needed, state what will be overwritten and get explicit approval.

### Never commit .env files or secrets
`.env`, credentials, API tokens, and session secrets are never committed. If a task requires adding a new secret, add the key to `.env.example` with a placeholder value only.

### Never discard another agent's uncommitted changes
If `git status` shows unstaged edits you didn't make, assume another agent is mid-task in the same working tree. `git stash push -- <file>` to set them aside if you need a clean tree for an unrelated operation (e.g. a branch merge), then `git stash pop` immediately after to restore them exactly as found. Never `git checkout --` or discard them. See [parallel-agents.md](parallel-agents.md) for the full multi-agent setup (prefer `git worktree` over sharing one tree).

---

## Core Solutions — Discovered in This Repo

Architectural decisions validated through real work. Add to this list when a solution proves itself.

---

### Auth: session cookies, never tokens in the bundle

**Rule:** Authenticate browser sessions with session cookies set by the server. Never read `API_TOKEN` or any secret from Vite/webpack env vars and embed them in the built JS.

**Why:** `VITE_*` env vars are baked into the JavaScript bundle and visible to anyone who opens DevTools or downloads the file. This was a live security issue: the raw server token was readable from the production build.

**How it works now:** `POST /api/auth/login` exchanges a token for a signed session cookie. All subsequent requests and WebSocket connections use the cookie (`withCredentials: true`). The frontend never holds the raw token.

**File:** `src/components/AuthGate.jsx`, `src/hooks/useAuthSession.js`, `serverXR/src/authSession.js`

---

### Storage: SQLite over JSON files for concurrent writes

**Rule:** Use SQLite (via the Node.js built-in `node:sqlite` / `DatabaseSync`) for all structured metadata. Do not use JSON files for anything that is written by concurrent requests.

**Why:** Multiple simultaneous requests were racing to read-modify-write the same `meta.json` and `ops.json` files, producing corrupt data and lost ops. SQLite serializes writes atomically at the OS level.

**Additional wins:**
- Ops appends are now single `INSERT` transactions — no read-before-write
- `findProjectById` is a single indexed query — no two-phase directory scan
- Automatic first-startup migration imports existing JSON files and marks done

**Files:** `serverXR/src/db.js`, `serverXR/src/migrate.js`, `serverXR/src/spaceStore.js`, `serverXR/src/projectStore.js`

---

### Performance: cache prepared statements per DB instance

**Rule:** Call `db.prepare(sql)` once when creating the store and reuse the statement object on every call. Do not call `db.prepare()` inside a hot function.

**Why:** `node:sqlite`'s `DatabaseSync` compiles SQL on every `db.prepare()` call. Caching the result at module init gave ~30–50% latency reduction on metadata hot paths (space list, project lookup).

**Pattern:**
```js
// Good — prepared once at init
const getSpace = db.prepare('SELECT * FROM spaces WHERE id = ?')
function findSpace(id) { return getSpace.get(id) }

// Bad — compiled on every call
function findSpace(id) { return db.prepare('SELECT * FROM spaces WHERE id = ?').get(id) }
```

---

### cPanel SQLite: use node:sqlite, never better-sqlite3 or WASM

**Rule:** On cPanel shared hosting, the only working SQLite driver is the Node.js built-in `node:sqlite` (`DatabaseSync`). Do not use `better-sqlite3` (no prebuilt for Node 24, no C++ toolchain on host) or `node-sqlite3-wasm` (CloudLinux LVE memory cap blocks WASM instantiation).

**Why:** Both alternatives crash on cPanel's CloudLinux environment. `better-sqlite3` fails with `gyp ERR! not ok` during `npm install`. `node-sqlite3-wasm` throws `RangeError: WebAssembly.Instance(): Out of memory` at startup. `node:sqlite` is stable since Node 22.5+, requires zero native compilation, and works inside the LVE memory limit.

**How:** `const { DatabaseSync } = require('node:sqlite')`. The `better-sqlite3` surface (`.pragma()`, `.transaction()`) is patched via a compat layer in `serverXR/src/db.js`. `StatementSync` already accepts variadic positional args natively — no wrapping needed.

**Files:** `serverXR/src/db.js`, `scripts/check-cpanel-compat.mjs`

---

### Docker: build from repo root to reach shared/

**Rule:** Build the serverXR Docker image from the **repo root**, not from `serverXR/`:
```bash
docker build -f serverXR/Dockerfile -t dii-server .
```

**Why:** `serverXR/src/sharedRuntime.js` loads schema files from `../../shared` relative to `src/` — which resolves to `/shared` inside the container. The `shared/` directory lives at the repo root, not inside `serverXR/`. Building from `serverXR/` makes it unreachable without a runtime volume mount. Building from the repo root lets us `COPY shared/ /shared/` and bake the schema in — no mount needed.

**Only `/data` is a volume:** SQLite DB and uploaded assets are runtime-mutable. Shared schema files are static — bake them in.

---

### File splitting: extract logic to hooks, keep components as render-only

**Rule:** When a component grows past ~300 lines, extract data/logic into a custom hook. The component becomes: call hook, destructure, return JSX.

**Why:** Components mixing logic and render are hard to test, read, and split further. Hook extraction is a pure refactor with no behavior change, and it makes the render intent obvious.

**Pattern used here:**
- `PreferencesPage.jsx` (was 1457 lines) → logic in `usePreferencesData.js`, component is 443 lines of render
- `App.jsx` (was 795 lines) → all wiring in `useAppState.js`, component is 56 lines of context providers + switch
- `StudioShell.jsx` (was 894 lines) → panels extracted to `StudioShellPanels.jsx`

**Check before splitting:** read the actual file first. PROGRESS.md line counts go stale. The split may already be done in an uncommitted session.

---

### Op-log: preserve CRDT compatibility

**Rule:** Do not change the op-log format to require server-side mutation, reordering, or conflict resolution. Keep it append-only. New op types must be expressible as commutative inserts.

**Why:** The current append-only format is already compatible with CRDT merge (last-write-wins or vector-clock ordering). This is the structural seed of the future P2P sync layer. Breaking it means rewriting sync later.

---

## Context / Credit Awareness

When context is running low:

1. Finish the current unit of work completely — no half-edits
2. Run lint + tests
3. Update PROGRESS.md with what changed and what's next
4. Stop

Starting a large task in low context is worse than not starting it. Choose a task that fits.

A good task size for a single agent session: one file split, one bug fix, one infra file, or one small feature completion. The easy wins list in PROGRESS.md is calibrated for this.

---

### Vite manualChunks: include every package that imports `three`

**Rule:** Every npm package that directly or transitively imports `three` must be listed in the `three-vendor` manualChunks group. Missing even one causes a circular chunk initialisation order that crashes the app in production (TDZ: `Cannot access 'X' before initialization`).

**Why:** Rollup splits chunks lazily. If `detect-gpu` lands in `vendor` and imports `three`, Rollup creates a `three-vendor → vendor → three-vendor` cycle. This is invisible in dev (Vite serves unbundled) and invisible in a local prod build unless you watch for the `circular dependency` warning. It only crashes at runtime in environments with strict module initialisation order (SES, lockdown, some CDN caches).

**Required three-vendor members (as of 2026-05-04):**

```text
three, three-mesh-bvh, three-stdlib,
@react-three/*, @react-spring/*, troika-*,
camera-controls, detect-gpu, maath,
@monogrid/gainmap-js, meshoptimizer, meshline,
r3f-perf, @pmndrs/*, @iwer/*, iwer
```

**How to verify:** `npx vite build` must complete with **zero** `circular dependency` warnings. If you see one, the newly-warned package must move into `three-vendor`.

**Files:** `vite.config.js`

---

### Always check CURRENT.md before investigating any runtime error

**Rule:** Before spending tool calls on an error, read `CURRENT.md`. It has a known-fixes table. If the symptom matches, apply the documented fix directly — do not re-investigate.

**Why:** Multiple AI sessions (Copilot, Gemini, Claude, Cursor) have independently re-investigated the same TDZ crash, the same auth spinner, and the same deploy flow — burning credits each time. `CURRENT.md` exists to stop this.

**How:** `CURRENT.md` is ≤50 lines. Reading it costs one tool call. Skipping it risks wasting 20+.

**Files:** `CURRENT.md`, `AGENTS.md`

---

### Capture rules mid-session, not at the end

**Rule:** Run `capture-rule.sh` the moment you find a non-obvious solution — not at stop time.

**Why:** Stop hooks fire at the end of a session. By then the precise context (what failed, what the number was, which two files interacted) is fuzzier or lost. Capture while the detail is live.

**How:** One command, works anywhere mid-task:
```bash
./scripts/capture-rule.sh "Title" "Rule" "Why" "How" "Files"
```

**Files:** `scripts/capture-rule.sh`, `scripts/golden-rules-check.sh`

---

### UI: one primary action, zero preamble, instant default path

**Rule:** Every screen must have exactly one primary action visible without scrolling. Remove descriptions, panels, and secondary UI that delay reaching it. The default path must require zero configuration — create with auto-names, open with one click, defer options to the next screen.

**Why:** The Studio Hub had a full description block, a labeled create panel with a title field, and a secondary button row — all before the project list. A user who just wants to open a project had to visually parse all of it first. Replacing it with a single `Projects` header + `+ New` button + immediate project grid dropped time-to-first-click to near zero. The title field was removed entirely: projects auto-name on create and can be renamed inside the editor.

**Principles that follow from this:**
- Input fields belong inside the flow they serve, not in the hub. If the user needs to name something, prompt them after creation, not before.
- Descriptions tell users what the screen does. If the screen's title doesn't make that obvious, fix the title — don't add prose.
- Secondary actions (Import, Admin, Beta, Public) belong in a de-emphasized secondary row: same row, tiny mono text, no visual weight.
- Destructive actions (Delete) should be present but visually quiet — low contrast until hovered.

**How:** Before shipping any hub or list screen, count the clicks from page load to the main action. If it's more than one, remove whatever is in the way. If it requires reading, remove or relocate the text.

**Files:** `src/studio/components/StudioHub.jsx`, `src/studio/styles/studio-hub.css`, `src/landing/landing.css`
