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
Never claim a task is done without these passing. The baseline is always "0 lint errors, current `npm run test` count all green" — run it fresh rather than trusting a number written here; a pinned count (this doc has done it before — "219 tests," and separately "221"/"16" in the 2026-07-07 audit) always goes stale within a few sessions. If either degrades, fix it before stopping.

### Coding is not done — test as a human would, in a real browser

**Rule:** Writing the code and passing lint/build/unit tests is not "done." Before reporting a UI/data-flow fix complete, drive it in an actual browser the way a human user would (click the real button, wait for the real network round-trip, look at the real screenshot) and confirm the thing the user asked for actually happened on screen.

**Why:** In this session, a "fix" (pointing the landing page at the actual published project) looked complete by every static check, but a live Playwright test showed zero asset requests firing — a second, pre-existing race condition (`useLiveProjectDocument` applying a stale, late-arriving response for an abandoned `projectId`) was silently eating the fix. It only surfaced because a real browser session was driven end-to-end and the resulting screenshot was inspected. Code-level reasoning alone said "this should work"; only a human-equivalent test caught that it didn't.

**How:** Playwright + a real Chromium binary are already installed in this repo (`npx playwright install chromium`, already pulled — see `~/.cache/ms-playwright`). No need to "set up" or vendor anything extra. For any change that affects what a user sees or clicks:
1. Start the dev stack (`npm run dev`), or confirm it's already running.
2. Drive the actual flow with Playwright — navigate, click, type, wait on real timers (not zero-wait assertions) — exactly as a person would.
3. Capture a screenshot and/or the network log and actually look at it. Don't infer success from "no errors thrown."
4. Only then say the task is done.

**Files:** `package.json` (`playwright` devDependency), `~/.cache/ms-playwright` (browser binaries, already present).

### Checking things as a human is allowed and expected — any environment, any engine

**Rule:** Agents are explicitly authorized to verify like a human user — launch real browsers, click, scroll, fill forms, screenshot, read the console — not only against local dev, but against staging and production URLs and sibling-project deployments (br_id_ge, beyond_form, …). When a user reports browser-specific breakage, reproduce it in a clean engine before touching code.

**Why:** 2026-07-09, beyond_form staging: the user hit CORS errors that blanked the page, but code review and `curl` headers showed nothing wrong. Driving the live URL in clean Chromium *and* a freshly installed Playwright Firefox proved the deployment healthy in both engines, isolating the cause to the reporting browser's profile/extensions — no code change needed, no wild goose chase. The verdict was only reachable by testing exactly like a human visitor instead of reasoning from code.

**How:** Chromium already lives in `~/.cache/ms-playwright`; other engines are one command away (`npx playwright install firefox`). For one-off scripts outside di.iiii, import from `di.iiii/node_modules/playwright/index.mjs`. Reproduce-first triage: clean engine passes → suspect the reporter's profile/extensions and say so with evidence; clean engine fails → real bug, bisect from there.

**Files:** `~/.cache/ms-playwright`, `node_modules/playwright` (di.iiii).

### Heavy 3D asset → web: the crush-serve-fallback pipeline

**Rule:** Never ship a raw scan/AI-generated model to a page. Every heavy 3D asset goes through the same pipeline: inspect → crush with gltf-transform → serve as a space asset (not inlined) → render with a static fallback → verify on the live deployment. This is the standard method for growing/polishing any project page in the ecosystem (beyond_form, br_id_ge, future spaces).

**Why:** 2026-07-09, beyond_form: a Tripo3D model of the project logo arrived at 1.46M triangles / 41.6MB. One `gltf-transform optimize` pass (simplify + Draco + WebP 1k textures) took it to 661KB — 63× smaller, visually identical at page scale. Inlining it into the single-file build would have ballooned the page ~55MB; serving it as a space asset kept the page at 1.2MB with the model streaming in. The fallback image meant the page never looked broken while iterating.

**How:**
1. **Inspect first** — parse the GLB header (JSON chunk at byte 20) for triangle/texture counts, and render preview screenshots headlessly (three.js viewer + playwright; `preserveDrawingBuffer: true` or screenshots come back blank) so you know what the model *is* before deciding placement.
2. **Crush:** `npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress webp --texture-size 1024`. Expect 10–100× reduction on scan/AI meshes.
3. **Serve, don't inline:** put the file in the repo's `public/` with a unique basename and reference it by that literal basename string in code — `scripts/sync-space.mjs` uploads it as a project asset and rewrites the basename to the asset URL in the built HTML. Works in dev (Vite serves `public/` at root) and on di-studio.xyz.
4. **Fallback:** wrap the Canvas in Suspense + an error boundary with a static image fallback — WebGL loss or fetch failure must degrade to the flat asset, never to a hole.
5. **Verify live, in the iframe:** sandboxed space iframes have origin `null`; `fetch()`-based loaders (GLTF/Draco) need the serverXR permissive-CORS shim for asset reads (in place since `7bfb260`). Media tags dodge CORS; fetch does not. Screenshot the deployed page, not just the local build.

**Files:** `beyond_form/src/HousesModel.jsx` (reference implementation), `beyond_form/scripts/sync-space.mjs` (asset upload + URL rewrite), `serverXR/src/index.js` (`PUBLIC_CORS_ROUTES`).

### Open calls are a platform capability now — reuse the cycle, don't rebuild it

**Rule:** When any project in the ecosystem needs an open call / application flow, reuse the pipeline built for Beyond Form end-to-end: in-design form → dual-write (organizers' Google Form + serverXR) → `/admin → Open Call` review board. New calls need only a new `callId` and a form component — the storage, API, CORS, rate limiting, and review UI already exist.

**Why:** Built 2026-07-09 for beyond_form and verified end-to-end by the user on staging. The schema was deliberately made call-agnostic (identity columns + a `payload` JSON blob), so a second open call costs a form component, not a backend.

**How:**
1. **Backend (exists):** `POST /api/open-calls/:callId/applications` — public, rate-limited, permissive CORS for sandboxed iframes. Admin `GET`/`PATCH` (status: new/shortlist/accepted/declined + notes) behind `requireAdminAlways`. Store: `serverXR/src/openCallStore.js`.
2. **Review board (exists):** `/admin → Open Call` tab — add the new call to the `OPEN_CALLS` list in `OpenCallSection.jsx`; chips/filters/notes/CSV come free.
3. **Keeping the organizers' Google Form as canonical collector:** extract field entry IDs from `FB_PUBLIC_LOAD_DATA_` in the form's viewform HTML; **validate them via a prefill URL** (`viewform?entry.X=TEST` — the value echoes back if the ID is right) so you never test-submit into their spreadsheet; POST to `formResponse` with `mode: 'no-cors'` (response is opaque — enforce required fields client-side). Date questions submit as `entry.X_year/_month/_day`. Labels stay verbatim in the source language.
4. **Dual-write semantics:** Google is canonical, serverXR is the review copy — success if either write lands, so neither system's downtime blocks an applicant.

**Files:** `serverXR/src/openCallStore.js`, `serverXR/src/routes/openCallRoutes.js`, `src/components/preferences/OpenCallSection.jsx`, `src/services/openCallApi.js`, `beyond_form/src/ApplyForm.jsx` (reference form with the Google-proxy method).

### When a feature lands on one surface, ask whether it should apply to all of them — past and future

**Rule:** Before calling a UX/behavior change "done," check whether the same capability already exists (or should exist) on every other surface that serves the same purpose — including spaces/projects/content that already existed before this change, not just new ones going forward. If it doesn't apply everywhere, say so explicitly and let the user decide the scope, rather than silently leaving it inconsistent.

**Why:** This session added walk/fly navigation to the landing page's decorative background and assumed it was a general capability. It wasn't — the actual public viewer every real space's URL uses (`PublicProjectViewer.jsx`, via `StudioViewport`) is a completely separate renderer with orbit-only navigation and no walk/fly at all. Every space created before or after this change would have been silently excluded if the user hadn't asked "will this apply everywhere?" The fix was a deliberate, scoped addition (a toggle alongside orbit, not a replacement) precisely because blindly applying a new behavior to every live space's public-facing viewer is a real-risk change that needs the user's explicit scope call, not an assumption.

**How:** When you build something that feels like it should be a platform-wide capability, grep for every component that renders "the same kind of thing" (e.g. `LiveProjectScene` vs `PublicProjectViewer` vs `StudioViewport` — three different renderers for what a casual look might assume is one "viewer"). If they diverge, ask: does this change apply to (a) just the surface you touched, (b) all surfaces going forward, or (c) all surfaces including pre-existing content? Each answer has a different blast radius and risk level — confirm which one before writing code that assumes the answer.

**Files:** `src/components/LiveProjectScene.jsx`, `src/project/components/PublicProjectViewer.jsx`, `src/wcc/WccExperience.jsx` — three independent renderers in this repo that look like they should be "the" viewer but aren't.

### Keep the user-facing Wiki current with every shipped feature

**Rule:** When you ship a user-facing feature or change user-visible behavior, add or update the matching entry in `src/wiki/wikiContent.js` (bump its `updated`) and, if it's headline-worthy, surface it on the landing page. Treat this as part of "done," same tier as updating CURRENT.md — not an optional follow-up.

**Why:** Guest/sandbox modes, the unified `/admin` Manage console, and the 3-free-spaces quota all shipped with zero user-facing explanation; the public landing still advertised only the old capabilities. A maintained in-app Wiki (`/wiki`) only stays useful if it is updated in the same change that ships the feature, not "later."

**How:** `src/wiki/wikiContent.js` is the single source of truth — articles render on `/wiki` and `WIKI_HIGHLIGHTS` feeds the landing teaser. Add an article (or edit the closest one), set `updated`, and add to `WIKI_HIGHLIGHTS` if it belongs on the landing. No markdown engine — `body` is an array of strings / `{ list: [...] }`.

**Files:** `src/wiki/wikiContent.js`, `src/wiki/WikiPage.jsx`, `src/landing/LandingPage.jsx`.

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

### External research (pricing, reviews, comparisons): a "no links found" search can still return a confident-sounding paragraph — treat it as unverified

**Rule:** When `WebSearch`/`WebFetch` explicitly says "no links found" or a fetch is blocked (403, paywall), but the tool response still contains a specific-sounding narrative ("users report X, Y, Z"), do not present that narrative to the user as a finding. It is the model filling in plausible-sounding filler from general training knowledge, not something it actually read. Only report a claim as researched if the tool result includes a real URL you can point to. If a query area returns no real sources, say so plainly ("couldn't verify OVH's reliability reputation independently — search returned no real sources despite a confident-sounding summary") rather than passing the filler through.

**Why:** During a 2026-07-14 VPS-provider price/reliability comparison, three `WebSearch` calls each ran; only one (Contabo CPU throttling) returned a real citable source (a LowEndTalk thread) — the other two ("Hetzner vs OVH vs Contabo reddit," "OVH VPS reddit complaints") explicitly said "No links found" yet still produced detailed, specific-sounding bullet points about downtime/support/performance complaints. Presenting all three with equal confidence would have handed the user two fabricated-sounding "findings" alongside one real one, with no way for them to tell which was which.

**How:** After any search/fetch call used for research (not casual browsing), check whether the result actually contains a URL/citation before writing up its content as a finding. Real source → cite it and use the content. No real source, narrative anyway → drop the narrative, tell the user the query came up empty, and either try a different query/source or say the comparison point is unverified.

**Files:** n/a (agent behavior, not repo code) — applies to any research task, VPS/hosting comparisons being the concrete case that surfaced it.

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

---

### Workflow: ask one clarifying question before implementing UX behavior changes

**Rule:** Before implementing any change to interactive behavior (hotkeys, gizmos, transform tools, mode switches), restate your understanding of the desired behavior in one sentence and ask the user to confirm. Do not start coding until the interpretation is locked. Credit-burning loops happen when the implementation is technically correct but wrong-shaped.

**Why:** The G/R/S + gizmo rework burned multiple iterations because "activate the gizmo" was interpreted as "arm the modal" when the user meant "show the Three.js drag handles." A single clarifying question before coding would have avoided two full rewrites.

**How:** One sentence restatement + one yes/no question. If there are two mutually exclusive interpretations, list both and ask which. Never list more than two options — pick the most likely one as the default.

---

### UI overlap: `position:fixed` at high z-index escapes every ancestor

**Rule:** When a visual element appears on top of something it shouldn't, search for `position.*fixed` + `zIndex` above 1000 before touching any CSS on the element you can see. The culprit is almost never in the same component tree.

**Why:** The axis gizmo (`z-index: 10`) was invisible under the `AccountButton` (`position: fixed; top: 8px; right: 8px; z-index: 9999`) for two full sessions. Every fix targeted the gizmo or the control cluster — neither was the problem. `position: fixed` is positioned relative to the viewport, ignores `overflow: hidden` on all ancestors, and creates a global overlay that can land on any component from a completely unrelated part of the tree.

**How:** When the symptom is "element X appears under element Y":
1. `grep -rn "zIndex.*[0-9]\{4\}\|z-index.*[0-9]\{4\}" src/` — list every high-z element
2. Compare positions: is any high-z `position: fixed` element at the same screen coordinates as the conflict?
3. Fix at the source of the overlay (hide it, reposition it, or reduce its z-index), not at the victim.

The fix here: `AuthGate` renders `<AccountButton>` as a sibling to its children. The studio editor has its own navigation (← Hub). `AuthGate` now accepts `showAccountButton={false}` to suppress it in editor context.

**Files:** `src/components/AccountButton.jsx`, `src/components/AuthGate.jsx`, `src/RootApp.jsx`

---

### Visual: landing page style is the locked default for new public surfaces

**Rule:** Dark background, true 3D perspective cyan grid floor (Three.js, not CSS), oversized bold wordmark with one cyan accent character, mono uppercase eyebrow, one solid-cyan primary CTA + one quiet ghost CTA. Reuse the `--di-*` tokens in `src/styles/base.css` and the `HeroScene` Three.js pattern rather than re-deriving colors or approximating the grid in CSS.

**Why:** Locked in 2026-06-19 as the reference look-and-feel after reviewing the staging landing page. Prevents future sessions from drifting to ad-hoc colors/effects on new public-facing screens.

**Files:** [`docs/ai/design-baseline.md`](design-baseline.md) (full color/typography/scene spec), `src/landing/LandingPage.jsx`, `src/landing/landing.css`, `src/styles/base.css`

---

### Shortcuts: every new shortcut goes in two places

**Rule:** When adding any new keyboard shortcut to Studio, update BOTH:
1. `SHORTCUT_SECTIONS` in `src/studio/components/StudioViewport.jsx` — the Shift+? in-app overlay the user sees
2. `docs/ai/shortcuts.md` — the persistent reference for agents and contributors

If the doc doesn't exist yet, create it. Never add a shortcut to only one place.

**Why:** The Shift+? overlay and the docs can drift apart silently — a shortcut gets added to code but never documented, or documented but never wired. This happened with Ctrl+G/Ctrl+Shift+G (group/ungroup) — the overlay was updated but the doc wasn't created yet. One rule, two targets, always both.

**Files:** `src/studio/components/StudioViewport.jsx` (`SHORTCUT_SECTIONS`), `docs/ai/shortcuts.md`

---

### UI: two surface families — never mix them

**Rule:** Every visual element in the studio belongs to one of two families. Copy values from `docs/ai/ui-system.md`. Never derive a new rgba value — map to the nearest existing one.

**Panel family** (floating panels, cluster, dialogs):
- Background: `rgba(4, 6, 9, 0.92)` · Blur: `blur(16px)` · Radius: `6–7px` · Shadow: `0 12px 40px rgba(0,0,0,0.55)`

**Viewport button family** (`?`, fullscreen, account, pane controls):
- Background: `rgba(15, 23, 34, 0.55)` · Blur: `blur(6px)` · Radius: `6px` · Size: `30×30px`
- Hover: bg `rgba(15,23,34,0.82)` · border `rgba(255,255,255,0.35)` · color `#fff`

**Why:** Mixing the two families was the source of every "looks off" report in studio UI sessions. The panel family is opaque/anchored; the button family is translucent/embedded-in-scene. They serve different purposes and must not share values.

**Viewport corner zones (locked):**
- Top-right: gizmo only — `top: 10px; right: 10px` (pane-absolute)
- Bottom-right stack (pane-absolute, `right: 14px`): account `bottom:86`, `?` `bottom:48`, fullscreen `bottom:14`

**Files:** `docs/ai/ui-system.md`, `src/studio/styles/studio.css`, `src/components/AccountButton.jsx`, `src/studio/components/StudioViewport.jsx`

---

### New space/project capability → build it in the shared layer, never per-space

**Rule:** Any new "thing a space can do" — a new object property, world setting, animation, render behavior, arrival/camera option — must be added to the **shared layer** so *every* space inherits it automatically. The shared layer is:

1. `src/shared/projectSchema.js` **and** its CJS mirror `shared/projectSchema.cjs` (keep in lockstep — `npm run test:schema-sync` guards it; a drift = 503 on deploy)
2. `src/components/LiveProjectScene.jsx` — the one engine that renders the public/live view for **all** spaces (`/<space>`, `PublicProjectViewer`, the WCC exhibition)
3. `src/project/entityRegistry.js` (object inspector fields) and/or `StudioShellPanels.jsx` World panel — so it's authorable in Studio for any project

Do **not** implement a capability inside a bespoke per-space renderer/component. That siloes it to one space and it silently won't exist anywhere else.

**Why:** The WCC exhibition was a 1150-line bespoke renderer that reimplemented walk/animation/atmosphere with a hardcoded layout — so none of it was reusable and the space wasn't tunable in Studio. Converging it onto `LiveProjectScene` + portal-composition made animation, `worldState.atmosphereBlend`/`hubDecor`/`spawn`, and `text.billboard` available to **every** space at once, authored as data. New features go in the shared layer for the same reason: one implementation, every space, tunable in Studio. (Matches MANIFESTO: prefer shared project logic over one-off editor paths.)

**Checklist for a new capability:** schema field (both files) → renders in `LiveProjectScene` → inspector/World-panel control → `test:schema-sync` + `lint` + `build` green → it now works in every space.

**Files:** `src/shared/projectSchema.js`, `shared/projectSchema.cjs`, `src/components/LiveProjectScene.jsx`, `src/project/entityRegistry.js`, `src/studio/components/StudioShellPanels.jsx`

---

### Every UI change is tested in Playwright across the window/device matrix before "done"

**Rule:** Any user-facing UI or layout change must be verified with **real human-behavior Playwright interaction** (scroll, click, drag — not just a static screenshot) across the standard matrix of window shapes AND mobile/tablet devices before it's considered done. Run:

```
node scripts/responsive-check.mjs <url> --scroll
# or: npm run check:responsive -- <url> --scroll
```

It loads the URL at desktop aspect ratios (16:9, 16:10, 4:3, 1:1, ultrawide, small-laptop) and real device descriptors (iPhone 13/SE, Pixel 5, iPad, iPad Mini landscape, Galaxy Tab), drives human-like scroll, captures a screenshot per viewport, and fails on any console/page error. Review the screenshots, not just the pass/fail.

**Why:** A WCC-landing scroll bug shipped because it only reproduced in the **production build** (not the dev server, which masks effect-timing via StrictMode remount) — the horizontal ScrollTrigger bound to `window` instead of the custom scroller and the panel track froze. It looked fine in a single dev-server screenshot. Driving real scroll in a built page across viewports is the only way to catch behavior + responsive bugs: production-build-only timing issues, aspect-ratio math (travel/overflow), and the mobile `(min-width: 801px)` breakpoint switching layouts. Static screenshots and dev-server checks are not sufficient.

**Also:** when a bug "works locally but not on staging", test the **production build** (`npm run build && npx vite preview`) — the dev server is not representative.

**Files:** `scripts/responsive-check.mjs`, `package.json` (`check:responsive`)

---

### Studio has five scene windows plus Projects — new features land inside them, never beside them

**Rule:** The Studio floating-shell taxonomy is fixed: **Create** (primitives, lights, file import, Google Drive, Commons, space files, scene assets), **Scene** (entity tree + selected-entity inspector), **World** (scene-wide settings), **Share** (publish, presentation, export, activity), **Code** (code files), plus one space-level window: **Projects** (list/switch/create/rename/delete the space's projects — user-requested 2026-07-13; desktop only, phones keep the five-window bottom bar). A new capability goes into the matching window as a `CollapsibleSection` (collapsed by default if it's a secondary flow) using the existing `scc-*`/`spa-*`/`insp-*` vocabulary. Do not add another window, a new toggle in the control cluster, or a parallel style. Panel ids are persisted in localStorage (`studioWorkspaceStorage.js`); if you ever rename/merge ids, extend `PANEL_ID_MIGRATION` in `StudioShell.jsx`.

**Why:** Studio grew to 9 floating windows (Library, Assets, Files, Inspector, Structure, Present, Publish, Activity, World) and became unmanageable — thin panels (Present = 2 dropdowns), duplicated actions (Import in two panels, XR entry in two places, world defaults editable in two panels), and a dead-end asset flow. The 2026-07-02 consolidation (user-approved) collapsed them to five task-shaped windows; every merge was sections-inside-a-window, not new chrome. Projects (2026-07-13, user-requested) is the one deliberate exception because its job — moving *between* projects — has no home inside any scene window; it must not become a precedent for scene-scoped features. More windows = more management burden, which is exactly what users complained about.

**Files:** `src/studio/components/StudioShell.jsx`, `StudioControlCluster.jsx` (`PANEL_BUTTONS`), `StudioShellPanels.jsx`, `src/studio/hooks/useStudioPanelState.js`

---

### Input handling never guesses the device — design it to be safe for all of them

**Rule:** Browsers do not reveal which physical device produced an event; any heuristic that infers "trackpad vs mouse wheel" (or similar) from delta sizes/modes is a guess that only holds on the machine it was tuned on. When behavior would depend on the device class, remove the ambiguity instead: pick a semantic that is harmless on **every** device (e.g. wheel deltaY = dolly, never pitch). Two hard sub-rules: (1) never swallow a denied capability request (pointer lock, fullscreen, permissions) without a working fallback — silencing the console error is not handling the failure; (2) when verifying input code, fire the inputs the code is supposed to **exclude** (line-mode wheel, pixel-mode large/small deltas, ctrlKey pinch, denied pointer lock via a rejecting stub), not just the intended gesture. Sensitivity constants tuned "by feel" on one machine are a smell — flag them in the commit message.

**Why:** The June-29 controls session shipped three artefacts at once: a ≤60px "trackpad" guard that hi-res mouse wheels pass (scroll pitched the camera into the floor), a pointer-lock rejection caught-and-ignored (mouse look silently dead on Wayland/after-Esc, WASD still working — "can move but can't look"), and a 3× sensitivity bump tuned on the author's trackpad. Each patch narrowed the previous heuristic instead of asking the design question ("should scroll ever touch pitch?"). The responsive-check golden rule didn't catch it because its matrix is viewports, not input devices. Fixed in bc0bb6b by removing the ambiguity: scroll = dolly for every wheel type, drag-look fallback when lock is denied.

**Files:** `src/components/LiveProjectScene.jsx` (Walker), `scratchpad/probe-walker2.mjs` pattern for input-class probes


---

### Newcomers never improvise a workflow — the onboarding is checked in

**Rule:** Every newcomer (human or AI agent, including anyone working from a fork) is pointed to `ONBOARDING.md` before their first task — §1–7 for repo/env setup, §8 for Claude Code. A fresh Claude session must never invent its own workflow: no asking for API keys to put in project files, no new conventions, no parallel process. The project ships its workflow in tracked files (`AGENTS.md`, `.claude/settings.json`, `.mcp.json`, `.claude/agents/`, `.claude/commands/`); the only per-person steps are CLI install, personal login, the trust prompt, and the two standard plugins — all listed in §8.

**Why:** A new collaborator forked the repo, started Claude, and got a from-scratch experience — the session began a new ad-hoc workflow and asked for an API key — because nothing told her the workflow already existed. All the machinery was in the repo; the instruction pointing to it was missing. Onboarding that isn't discoverable is the same as no onboarding.

**How:** When the workflow changes (plugin set, hooks, permissions, MCP servers, slash commands), update `ONBOARDING.md` §8 in the same PR — same tier as CURRENT.md. When handing the repo to someone new, the entire instruction is one line: "clone, then follow ONBOARDING.md top to bottom."

**Files:** `ONBOARDING.md` (§8), `README.md` (Contributing), `.claude/settings.json`, `.mcp.json`, `docs/ai/parallel-agents.md` (Mode 0 fork contract)

---

### Node child processes: a signal-killed child leaves `exitCode` null forever

**Rule:** Never use `child.exitCode === null` to mean "still running." A child that died from a signal (SIGTERM/SIGKILL) has `exitCode: null` permanently — only `signalCode` is set. Guard process-teardown helpers with an explicit `let exited = false; child.once('exit', () => { exited = true })` flag, and make `stop()` idempotent, or a second stop will `kill()` a corpse and await an `'exit'` event that already fired — a silent, unbounded hang.

**Why:** The space-bundle contract suite stops the source server mid-test (to prove export works offline) and again in `afterEach`. The second stop saw `exitCode === null` on the already-SIGTERM-killed child, sent SIGKILL, and awaited `once('exit')` forever — every test "passed" its body then died on a 30s hook timeout. The other contract suites never hit this only because they stop each server exactly once.

**How:** Track exit via the event, not the field:

```js
let exited = false
child.once('exit', () => { exited = true })
const stop = async () => {
  if (exited) return
  child.kill('SIGTERM')
  const sawExit = await Promise.race([
    new Promise(r => child.once('exit', () => r(true))),
    wait(3000).then(() => false)
  ])
  if (!sawExit && !exited) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)) }
}
```

**Files:** `serverXR/src/bundleContracts.test.js` (the guarded pattern); `httpContracts.test.js` / `projectContracts.test.js` carry the unguarded single-stop variant — copy the guarded one for any new suite that stops servers mid-test.

### Open-call applications live only in the DB — back them up before any data operation

**Rule:** `open_call_applications` rows (real people applying via the live open-call form) exist ONLY in each environment's SQLite DB. They are NOT in space bundles, install bundles, scene/document syncs, or git. Before any bulk data operation on an environment that has a live open call — bundle import/restore, space deletion, DB surgery, environment resync — export them first: `node scripts/backup-open-call-applications.mjs --base-url <origin>/serverXR --token <admin-token> --label <env>`. Never delete the space hosting an open call (`beyond-form`) as part of cleanup while the call is running.

**Why:** During the 2026-07-10 three-way environment sync, prod's application count grew from 8 to 10 *while the sync was running* — submissions arrive continuously. `install-bundle.mjs`/`space-bundle.mjs` deliberately exclude user tables, so a "restore onto fresh root" recovery would have silently destroyed every application with no error and no trace.

**How:** The backup script writes timestamped JSON to `serverXR/data/_backups/open-call/` (gitignored — applications contain names/emails/phones and must never be committed). Content syncs via scene/document PUTs are safe: applications are keyed by `call_id`, not joined to space/project rows.

**Files:** `scripts/backup-open-call-applications.mjs` (exporter), `serverXR/src/routes/openCallRoutes.js` (admin list endpoint), `serverXR/src/openCallStore.js`, `serverXR/src/db.js` (table).

### External work only counts as "in di.iiii" once it's a Studio Project the user can open and edit

**Rule:** For any linked project (e.g. `br_id_ge`), a page/doc/rider is not "done" when it exists as a file in a repo — it is done when it is synced into a di.iiii space as a **Project** the user can open in Studio and edit directly (text, layout, assets) without touching a code editor or repo. Repos (public or ops) are file sources and CI/Pages mirrors only; di.iiii Studio is the editing surface. When adding or changing content that a linked project owns, update its `di-space*.json` manifest and run the sync script in the same change, not as an afterthought.

**Why:** di.iiii is the user's own platform — the whole point of building it is that authoring happens inside it, not scattered across local files he has to ask an agent to open. The br_id_ge-ops architecture makes this explicit: hosq/jam/rider/graph drafts live in the ops repo as source, but `scripts/sync-ops.sh` pushes each one into a project inside the single public space `br_id_ge`, specifically so the user can open Studio and edit it live. `scripts/graduate.sh` then promotes an approved draft to the public repo/Pages mirror for sharing — sharing is the repo's job, editing is Studio's job. Treating a repo file as the finished artifact skips the reason di.iiii exists.

**How:** New or changed content for a linked project → (1) edit the source file, (2) confirm/add its entry in the project's `di-space*.json` manifest, (3) run the sync command (`sync-ops.sh` / `sync-space.mjs` / equivalent), (4) tell the user which Studio project now holds it so they can open and adjust it themselves. Never treat "I edited the HTML file" as the end state for content the user needs to iterate on visually.

**Files:** `br_id_ge-ops/scripts/sync-ops.sh`, `br_id_ge-ops/AGENTS.md` (architecture), `br_id_ge/scripts/sync-space.mjs` (public repo CI sync), `src/studio/components/StudioShell.jsx` (Projects window, per the five-windows-plus-Projects rule above).

### Once a project is Studio-edited, the repo sync becomes one-way and dangerous — stop pushing, or build the pull first

**Rule:** The moment the user starts editing a synced project's content live in Studio (user command 2026-07-13, br_id_ge hosq), that project's Studio document — not the repo file — is the source of truth. `space-sync.mjs`/`sync-ops.sh`-style sync scripts in this codebase are **push-only** (repo → space `PUT`, no read-back). Re-running one of them against a Studio-edited project silently overwrites the user's live edits with the stale repo file — there is no warning, no diff, no undo. Until a project has an explicit pull/export tool (Studio document → repo file), do not: (a) hand-edit that project's repo source file, or (b) run the push-sync against it. Direct the user to edit in Studio instead, and treat the repo copy as stale until someone builds the missing pull direction.

**Why:** Same content, two editable copies, one-directional sync = a data-loss trap the instant editing moves off the repo. This was caught before it bit anyone (br_id_ge hosq rider, 2026-07-13) only because the user said out loud that Studio should be authoritative going forward — nothing in the sync tooling itself would have surfaced the conflict.

**How:** If a linked project genuinely needs both a Studio-editable copy and a repo mirror (e.g. for git history or CI/Pages), the fix is a real pull command — `GET` the space document content and write it back to the repo file — not a convention to "just remember not to sync." Until that exists, keep the set of Studio-authoritative projects small and explicit (documented per-repo, e.g. `br_id_ge-ops/AGENTS.md`), and treat any push-sync script as scoped to repo-authoritative projects only.

**Files:** `scripts/space-sync.mjs` (push-only, no pull), `br_id_ge-ops/scripts/sync-ops.sh`, `br_id_ge-ops/AGENTS.md` (per-project authority list).

### 3D/spatial labels need a backdrop plate, and fixed UI chrome needs its neighbor's footprint reserved — neither gets overlap avoidance for free

**Rule:** Any billboarded in-scene text (portal node names, constellation node names) must render on top of an opaque or near-opaque plate, never bare text over the scene. Any fixed-position DOM chrome (corner badges, floating panels) that can grow — a dropdown, an expanding list — must have its max size capped to leave room for whatever else is pinned to the same or an adjacent corner, computed explicitly, not left to "they're in different corners so it's fine."

**Why:** Reported 2026-07-14 on the `br_id_ge` portal-map project page (and confirmed to reproduce identically in WCC's exhibition ring, since both render portal nodes through the same shared `PortalObject.jsx`): `Billboard`+`Text` node labels are camera-facing but stay at a fixed 3D world position with zero collision/overlap avoidance against each other or against a project's own header/legend content, so at some camera angles labels visually merge into illegible noise. Separately, `ProjectSwitcher`'s expanded project list (pinned top-left, `maxHeight: 60dvh`) had no awareness of `MadeWithBadge` pinned bottom-left — a long enough list grew straight down into the badge. Two different failure modes (in-scene billboard vs. fixed DOM chrome) with the same root cause: elements positioned independently, with no shared layout system and no one accounting for what else occupies the same screen region. `SpaceConstellation.jsx`'s `Html`-based node labels (Studio's Grid/Map view) had the identical bare-text-no-plate pattern.
This does **not** fully solve node-to-node label collision (two labels can still overlap each other at extreme clustering/zoom) — that would need real screen-space collision layout, which is a bigger feature than "make it minimal." The plate just keeps overlaps *legible* instead of *ugly*; true collision avoidance is still open if it recurs.

**How:** For any new billboarded/in-scene text label, add a dark `meshBasicMaterial` plane behind it (see `LabelPlate` in `PortalObject.jsx` — width estimated from character count, not measured, which is good enough for short node labels only). For `Html`-based labels, give the label element itself a `background` + `border-radius` (see `.scon-label`/`.scon-sat-label`). For any fixed-position corner chrome that can grow (a dropdown, a list), cap its `maxHeight`/`maxWidth` with an explicit `calc()` that reserves the neighboring fixed element's known footprint — don't assume different corners never collide.

**Files:** `src/project/viewport/PortalObject.jsx` (`LabelPlate`, shared by every portal node across di.iiii, WCC, and any other `LiveProjectScene`/`PublicProjectViewer` consumer), `src/project/components/ProjectSwitcher.jsx` (capped `maxHeight`), `src/studio/styles/space-constellation.css` (`.scon-label`, `.scon-sat-label`), `src/components/MadeWithBadge.jsx` + `madeWithBadge.css` (the fixed bottom-left neighbor being reserved for).

### Never push generated HTML/code-mode content to a Studio project without rendering it first

**Rule:** When a project's document is built by a script (string `replace`/regex edits assembling a `presentationState.codeHtml` page, or any generated HTML artifact), render it in a real headless browser and check for zero `bodyHTMLLen`/console errors *before* the `PUT /api/projects/:id/document` call — not after, based on the user reporting a blank page. A `curl` 200 or an `"ok":true` response only proves the JSON was accepted; it proves nothing about whether the HTML inside `codeHtml` still parses.

**Why:** 2026-07-15, building the di.i brand-guide Studio project: a build script injected extra CSS via `html.replace('</style>', extraRules)` — which *deletes* the closing tag it matched instead of preserving it, leaving `<style>` unclosed. The browser silently swallowed the entire rest of the document (all body content, ~800KB of markup) as stylesheet text — zero console errors, zero JS exceptions, the page just rendered pitch black. Two rounds of "pushed it, confirmed 200, told the user it's live" shipped this before the user caught it visually and reported "empty." A 10-second Playwright check (`page.setContent` + `document.body.innerHTML.length > 0`) would have caught it before either push.

**How:** After any build script writes a `codeHtml`/generated-HTML string and before it's PUT to a project document: launch Chromium via Playwright (already installed, `npx playwright install chromium` once per machine — no `--with-deps`, that needs root), `page.setContent(html, {waitUntil:'load'})`, assert `document.body.innerHTML.length` is non-trivial and `page.on('pageerror')` fired nothing. Only then push and tell the user it's live. Also sanity-check tag balance cheaply first (`grep -c '<style' vs '</style>'`, same for `<script>`/`<body>`) — it catches this exact class of bug in one line before even opening a browser.

**Files:** none specific to this repo yet — this was a scratchpad build script (`build-guide.js`) outside version control, but the lesson applies to any future in-repo tool that assembles HTML strings for a Studio `codeHtml` document (e.g. `br-id-ge-*` content pushes, WCC one-pagers).

### A "random secret when none is configured" fallback must never be `crypto.randomBytes()` per process — derive it deterministically instead

**Rule:** Any secret used to sign/encrypt something that must be verified or decrypted by a *different* process or a *later restart* of the same process (CSRF `state` tokens, session cookies, at-rest encryption keys) must never fall back to `crypto.randomBytes()` generated fresh each time the module loads. If no real secret (`AUTH_SESSION_SECRET`/`API_TOKEN`) is configured, derive a stable fallback deterministically from other already-configured, already-secret material (e.g. `sha256("purpose:" + oauthClientSecret)`) so it survives restarts — or, if no such material exists, warn loudly at startup (`logger.warn`) that whatever depends on it won't survive a restart, the way `driveTokenStore.js` already did before this bug was found.

**Why:** 2026-07-16, shipped same-day as the fix it was meant to harden: a login-CSRF audit added a `signLoginState`/`verifyLoginState` pair whose fallback secret (when `AUTH_SESSION_SECRET` isn't set — true for this deployment's `REQUIRE_AUTH=false` open-guest mode) was `crypto.randomBytes(32)` generated once per **process**. Every server restart between a user's OAuth "sign in" click and the callback a few seconds later (redeploys, crash-restarts — routine on a small VPS) minted a new random secret, so the state token from before the restart never verified after it — production sign-in failed with no code path ever throwing or logging an error, just a silent redirect to `?auth=error`. The identical pattern existed in a second file (`integrationRoutes.js`'s Drive-connect state) from the same commit. A near-identical, but already-correctly-handled, precedent already existed in `driveTokenStore.js` (the Drive-token encryption key) — it uses the same random-per-process fallback, but the person who wrote it explicitly reasoned through the consequence in a comment and added a startup warning; the login-state code didn't do either.

**How:** Before adding any `X || crypto.randomBytes(...)`-style fallback for a signing/encryption key: ask "does whatever verifies/decrypts this run in a different process, or after a restart, than whatever signed/encrypted it?" If yes, either (a) derive the fallback from other stable configured secrets (OAuth client secrets, in this codebase — see `deriveFallbackStateSecret` in `authRoutes.js`), or (b) if truly nothing stable is available, keep the random fallback but add a `logger.warn` at the point it's selected, spelling out exactly what breaks across a restart (see `driveTokenStore.js`). Never ship the random fallback silently. A useful regression-test shape: register/construct two independent instances with the same config (simulating two processes) and confirm a value signed by one verifies against the other.

**Files:** `serverXR/src/routes/authRoutes.js` (`deriveFallbackStateSecret`), `serverXR/src/routes/integrationRoutes.js` (`fallbackStateSecret`), `serverXR/src/driveTokenStore.js` (the pre-existing correctly-warned precedent), `serverXR/src/routes/authRoutes.test.js` (the two-instance regression test), `docs/ai/known-fixes.md` (full incident writeup).

### Never call a per-request-value function as an *argument* to `router.get(path, middlewareFactory(...))` — the argument evaluates once, at registration

**Rule:** `passport.authenticate(strategy, options)` — and any middleware factory shaped like it — is called exactly once, when the route is registered (server startup), not once per incoming request. Any value inside `options` that must differ per request (a signed nonce, a timestamp, anything with `crypto.random*` or `Date.now()` in it) gets computed once and reused for the rest of the process's lifetime if you write `router.get(path, factory(freshValue()))`. To get a fresh value per request, wrap it: `router.get(path, (req, res, next) => factory(freshValue())(req, res, next))`.

**Why:** This is the actual root cause of the 2026-07-16 "Sign-in failed" production incident (the entry directly above this one was the *wrong* theory, corrected after live verification) — `router.get('/api/auth/github', passport.authenticate('github', { state: signLoginState(stateSecret) }))` signed the CSRF `state` once at startup and reused that identical value for every login for the container's entire lifetime, so sign-in only worked within the 10-minute state TTL of a restart and failed for 100% of logins after that. It survived code review, lint, and the full test suite, because every existing test called `registerAuthRoutes` once and inspected the routes it produced — none of them called the *same* route handler twice and compared the two results, which is the only shape of test that would have caught "this value doesn't change between calls." A live `curl` of the actual endpoint twice, a few seconds apart, found it in under a minute — cheaper and more conclusive than re-reading the code.

**How:** When wiring any `router.get/post(path, someFactory(...))`, ask: does any argument to `someFactory` contain something that must be fresh per request (nonce, timestamp, per-request user/session data)? If yes, the call to `someFactory` must happen *inside* a request-handler closure, not inline as the argument to `router.get`. When adding a test for a route like this, include one that invokes the *same* registered handler twice and asserts whatever should vary per-request actually does — a single-call test cannot distinguish "computed per request" from "computed once and cached."

**Files:** `serverXR/src/routes/authRoutes.js` (the two `/api/auth/{github,google}` authorize routes), `serverXR/src/routes/authRoutes.test.js` ("signs a fresh state on every request" — calls the handler twice), `docs/ai/known-fixes.md` (full incident writeup, including the wrong first theory and how it was corrected).

### Staging's compose override reads `STAGING_`-prefixed host env vars, not the bare names — editing the bare line in `.env` is a silent no-op

**Rule:** On the VPS, `docker-compose.staging.yml` maps container env vars from `STAGING_`-prefixed host variables (`GITHUB_CLIENT_ID: ${STAGING_GITHUB_CLIENT_ID:-}`, same for `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`OAUTH_CALLBACK_BASE_URL`/`AUTH_SESSION_SECRET`) — not the bare-named variables that also happen to exist in `/opt/di.iiii-staging/.env` (left over from the shared `.env.example` template both prod and staging are copied from). Before editing any credential/config var in that file, `grep` the actual compose files for which host variable name the *staging* override reads — don't assume the bare name is live just because it's present and non-empty-looking in the file.

**Why:** 2026-07-16, wiring up staging OAuth credentials: set `GITHUB_CLIENT_ID`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` directly in `/opt/di.iiii-staging/.env`, restarted the container, and `GET /api/auth/providers` still reported `{github:false,google:false}` — the edit had silently done nothing. `docker exec`-ing into the container and echoing the actual env var confirmed it was empty despite the `.env` file showing a value on the bare-named line. `grep`-ing `docker-compose.staging.yml` immediately explained it: that override reads `STAGING_GITHUB_CLIENT_ID` etc., a completely different host variable, and *that* one was still empty. (`OAUTH_CALLBACK_BASE_URL` looked like it "worked" on the first attempt purely by coincidence — its `STAGING_OAUTH_CALLBACK_BASE_URL` counterpart had already been set correctly by an earlier staging-setup session.)

**How:** Before setting any env var on the VPS for the staging stack specifically, run `grep -n '<VAR_NAME>' docker-compose.staging.yml` in the repo first to see which host variable name it actually consumes for that key — prod's plain name, or a `STAGING_`-prefixed one. Verify a change took effect with `docker exec <container> sh -c 'echo $VARNAME'` after recreating, not just by re-reading the `.env` file (the file being correct proves nothing about what the container actually received).

**Files:** `docker-compose.staging.yml` (the `STAGING_*` mappings), `/opt/di.iiii-staging/.env` (the host file, not in git), `docs/ai/known-fixes.md` (the OAuth-wiring incident this was caught during).

### A version-checked read-modify-write across multiple `await`s needs a per-key lock — the version check alone is not atomic

**Rule:** Any route handler shaped like "read current version → compare to caller's baseVersion → read data → compute → write data → append history → bump version," where each step is a separate `await`, is not safe under concurrency just because it checks a version number. Two requests can both read the same `currentVersion`, both pass the check, and both write — one silently clobbering the other, both callers getting a success response. Wrap the whole check-then-write sequence in a per-key async lock (`serverXR/src/asyncLock.js`'s `createKeyedLock()`), keyed by whatever the version is scoped to (space id, project id), and re-fetch the current version *inside* the lock, not from a snapshot taken before acquiring it.

**Why:** A 2026-07-16 audit found this exact race independently in three call sites doing the identical shape: `POST /api/spaces/:spaceId/ops`, `POST /api/projects/:projectId/ops`, and the full-document/scene replace paths (`PUT .../document`, `replaceSceneAndBroadcast`) — none of them had it, even though `inscriptionRoutes.js` had already solved the same problem for its own (much smaller) write path with a simple per-space promise-chain lock. The version check alone gives a false sense of safety: it looks like optimistic concurrency control, but with no atomicity around the check + the write it guards, it's not actually enforcing anything under real concurrent load. Confirmed via a real regression test firing two genuinely concurrent HTTP requests at the same server (not sequential — `Promise.all`, not `await` then `await`) at the same `baseVersion`: before the fix, this reliably produced two `200` responses and two op-log rows sharing one version number; after, exactly one request wins with `200` and the other gets a real `409`.

**How:** `const withLock = createKeyedLock()` once per module; wrap the check-then-write in `await withLock(key, async () => { ...fresh read, compare, write... })`; re-derive "current version" from a fresh read taken *inside* the callback, since anything captured before acquiring the lock may already be stale by the time it runs. Add a defense-in-depth DB-level UNIQUE index on `(scope_id, version)` too (see `serverXR/src/db.js`'s `dedupeAndUniqueOps` migration) so that if this pattern is ever reintroduced somewhere new, it fails loudly (a thrown constraint violation) instead of silently corrupting the op log. When writing the regression test for this shape, use two `fetch()` calls started together via `Promise.all`, not two awaited sequentially — a sequential test cannot distinguish "the lock works" from "there was never a race to begin with."

**Files:** `serverXR/src/asyncLock.js` (the reusable lock), `serverXR/src/routes/spaceRoutes.js` / `projectRoutes.js` (the three fixed call sites), `serverXR/src/routes/inscriptionRoutes.js` (the pre-existing correct precedent), `serverXR/src/db.js` (`dedupeAndUniqueOps`), `serverXR/src/httpContracts.test.js` / `projectContracts.test.js` (the concurrent-`Promise.all` regression tests), `docs/ai/known-fixes.md` (full incident writeup).
