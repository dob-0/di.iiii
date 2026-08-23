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

### Verify infra/deploy/tool facts before citing them — don't answer from recall
The same staleness risk as the rule above applies to facts that live outside this repo's file
contents: deploy workflow names, hosting topology, model/tool names. These change without a
corresponding memory update, and citing an old one reads as confidently wrong rather than
obviously outdated. Concrete incident: this repo migrated its production deploy off cPanel to a
Hetzner VPS on 2026-07-15 (`docs/deploy/LIVE_DEPLOY.md` — the doc `AGENTS.md` calls "deploy
truth"); an agent session afterward still cited the old `publish-cpanel-prebuilt-v2.yml` workflow
from session memory instead of re-reading that doc. Before citing a deploy workflow name or infra
topology fact, re-read `docs/deploy/LIVE_DEPLOY.md` rather than recalling it. Before citing a
model or tool name, verify it still exists rather than trusting cached knowledge of what used
to be configured — the local-model lane was documented here for months after it was gone.

### Run lint and tests after every code change
```bash
npm run lint
npm run test
```
Never claim a task is done without these passing. The baseline is always "0 lint errors, current `npm run test` count all green" — run it fresh rather than trusting a number written here; a pinned count (this doc has done it before — "219 tests," and separately "221"/"16" in the 2026-07-07 audit) always goes stale within a few sessions. If either degrades, fix it before stopping.

**While iterating on Raw, `npm run test:raw` is the fast loop** — Raw, the node
graph, Studio's graph surfaces and the node vocabulary guards, roughly a quarter
of the wall-clock of the full run. It is a SUBSET and never the thing you finish
on: run `npm run test` before calling anything done. Its scope is guarded by
`src/raw/rawTestScope.test.js`, which goes red naming the file if a test that
reaches into `src/raw` or `src/project` lands outside what `test:raw` collects —
so the subset cannot quietly stop covering something. Add a test there, not a
filter you remember to update.

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

### Restate the core concept in the user's own words and get it confirmed before building

**Rule:** On any open-ended or architectural ask, write back what you believe the core concept *is* — in the requester's vocabulary, not a restatement of their sentence — and get an explicit yes before writing code. This is not "ask if ambiguous": a request can be perfectly clear as English and still leave you holding the wrong mental model.

**Why:** 2026-08-06, the ask was "have the Studio in the graph… like in TouchDesigner where the palette has already-built things and you can build your own." Three readings were live: Studio panels each becoming a node type; one shared document with Studio and Raw as two views onto it; or Raw growing until it replaces Studio. All three are plausible, all three are weeks of divergent work, and the prompt discriminates between none of them. The actual answer was a fourth thing — *one* `studio` palette entry that, when you enter it, reveals the subgraph it is assembled from — i.e. a container node. One round of restating produced it in two sentences. Building first would have produced the wrong architecture confidently.

**How:** Name the concept, name the mechanism you think implements it, and name what it is *not*. Prefer the user's own reference points (they said TouchDesigner, so answer in COMP/palette terms). If you find yourself listing three options in your head, that is the signal to stop and restate — not to pick the safest one and proceed. Pair this with the existing two-question cap: restating is one message, not a loop.

**Files:** n/a (agent behavior). The concrete case: `src/project/nodeRegistry.js`, `src/raw/components/RawEditor.jsx`.

### Every interaction ships a touch path, not just a responsive layout

**Rule:** A surface is not mobile-ready because it reflows. Every action reachable on desktop must have a working path on a phone, designed in the same change that adds the action — never deferred to a later "mobile pass".

**Why:** 2026-08-06 audit of Raw: **you could not connect two nodes on a phone at all.** `RawGraphSurface.jsx` starts a wire on the output dot's `pointerdown`; on touch the browser grants that element *implicit pointer capture*, so `pointerup` is delivered back to the output dot and never to the input dot under the finger — the drop handler could not fire, ever. Port dots were 8×8px against a 44px target. Edge deletion was hover-then-click on a 2px stroke, which touch cannot trigger, and it was the only way to delete an edge. None of this reflows into existence; the CSS was irrelevant. Worse, `RawGraphSurface.test.jsx` stubbed `setPointerCapture` with `vi.fn()`, so the drag tests passed green over exactly the semantics that were broken.

**How:** For each new interaction ask: what fires it with one finger? Use pointer events with explicit `releasePointerCapture` + `document.elementFromPoint` for drag-and-drop between elements — implicit capture makes the naive `pointerup`-on-target pattern a desktop-only illusion. Hit targets ≥44px (a visual dot can stay small; enlarge the hit box). Never make hover the only affordance. Never stub `setPointerCapture` in a test that is meant to prove dragging works.

**Files:** `src/raw/components/RawGraphSurface.jsx`, `src/raw/styles/raw.css`, `scripts/verify-surfaces.mjs`.

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

### Size every large task against usage limits before starting — and never let a limit brick the process

**Rule:** Before starting any large task (multi-hour, multi-file, or fan-out/multi-agent), size it against Claude usage limits — the 5-hour rolling session window and the weekly cap. If usage state is known (`/usage`, or the user says they're near a limit), factor it in; if unknown, assume mid-window and route to the cheapest adequate model per the existing model-routing rules. If the task plausibly won't fit the remaining window, split it into checkpointable phases *before* starting — each phase must end in a state safe to stop at: tests pass, work committed locally, nothing half-edited.

**Why:** A limit hit mid-task with files half-edited, WIP only in chat context, and no resume notes bricks the process: the next window starts cold, re-investigates, and may discard or clobber the unfinished work. Planning against the budget up front costs one minute; recovering from an unplanned cutoff costs a session.

**How — the never-brick workflow when a limit is near or hit mid-task:**
1. Stop starting new subtasks.
2. Finish or revert the current file-level edit so the tree is coherent.
3. Commit WIP locally on `dev` with a clear `wip:` message — never push.
4. Update CURRENT.md's Open section with exact resume state: what's done, what's next, which files are mid-flight.
Resume the next window from CURRENT.md, not from memory.

**Files:** `CURRENT.md` (Open section = resume state), `docs/ai/roles/model-routing.md` (cheapest-adequate-model routing).

### Valuable perks and conventions get codified the same session they appear — never left only in chat

**Rule:** Anything of durable value discovered during a session — a convention, a workflow that worked, a hard-won fix, a tool trick, a decision with reasons (a "perk") — must be written into its durable home *in that same session*: behavior rules here in golden_rules.md, bug fixes in known-fixes.md, session/resume state in CURRENT.md, product decisions in the relevant doc. This holds for things discovered by the user or by any agent, and regardless of who does the writing — if another agent produced the perk, the session that notices it uncodified codifies it.

**Why:** Chat context dies with the session — on a limit, a crash, or simply the end of the conversation. Every perk that lives only in chat is re-discovered (or worse, contradicted) by the next session at full cost. The repo's whole AI-memory system (CURRENT.md / golden_rules / known-fixes) only works if capture happens at discovery time, not "later".

**How:** When you notice a durable learning mid-task, write it down immediately or add an explicit line to CURRENT.md's Open section so it cannot be forgotten at session end. Ending a session with an uncaptured perk is the same class of "not done" as shipping a bug fix without its known-fixes entry.

**Files:** `docs/ai/golden_rules.md`, `docs/ai/known-fixes.md`, `CURRENT.md`.

---

## Core Solutions — Discovered in This Repo

### Verify as a human — desktop and phone — or it is not done

**Rule:** Any change that can alter what a person sees or does is verified in a
real browser, on desktop **and** on a phone, by looking at it — before it is
called done. `npm run verify:surfaces`, then open the screenshots.

**Why:** `docs/ai/known-fixes.md` holds 134 defects. 43 are *silent failures*
(swallowed catch, hardcoded fallback, a 200 carrying the SPA shell instead of
the asset), 29 are mobile/touch-only, 24 are "renders but is blank, invisible or
covered". None of these fail a unit test — that is the definition of the class.
Two shipped examples: the field's cores were built `visible:false` and only
revealed by a button most visitors never pressed (data loaded, count correct,
screen empty), and the rite set `body{cursor:none}` with nothing drawn in its
place, so the mouse simply disappeared. Both were green everywhere.

**How to apply:** `docs/ai/verification-charter.md` is the standard, including
the device matrix and the two detection techniques that do NOT work here
(`elementFromPoint` for occlusion; filtering chrome by "positioned AND painted").
Agents: `human-verifier`, `silent-failure-hunter`, `release-verifier`.

**Trap:** Claude's Chrome extension drives a tab where `document.hidden` is
true, so Chrome freezes `requestAnimationFrame` and CSS transitions — every
WebGL surface and animated reveal renders blank whether or not it is broken.
This produced a false "production is broken" report. Use Playwright for anything
that animates or renders 3D.


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

### Every space shows a preview by default, and the owner can always override it

**Rule:** A space card is never blank. Every space gets an automatic preview with no
action from anyone, and the owner can replace that automatic preview with an image
they choose — and take it back off again. Automatic is the floor, not the ceiling:
never ship a space kind whose only route to a preview is "the owner uploads one",
and never make an uploaded image un-removable.

**Why:** `algovrithm` shipped to production with a blank card while every other space
had a picture, and the reason was structural rather than a missed step. The card falls
back in a fixed order — a custom image, else a live miniature of the published project,
else nothing — and that middle branch needs `isPublic && publishedProjectId`. A CODE
space has no project document at all (its scene is React, in `src/`), so it can never
reach the automatic branch and lands on `nothing`. The audit that found it also found
`open` in the same hole for a different reason: it forwards into a shared jam project
and so has no `publishedProjectId` of its own either. Two spaces, one missing floor.

The override half is not decoration. The automatic miniature renders the published
project, which for a timed piece is whatever moment the renderer happens to catch —
for `algovrithm` that is frequently a black frame, since two of its beats are near-
black by design. The owner has to be able to say "this frame, not that one", and to
undo it later without an administrator.

**How:** The order is in `SpaceHub.jsx` and is correct as written — keep it, and keep
`handleUseLivePreview` (which clears `previewImageAssetId` back to `null`) as the way
back to automatic. What must be added for any new space kind is a way to REACH the
automatic branch. For a code space that means a captured frame of the piece itself,
not a logo and not a placeholder: the card's job is to show what the visitor will get.

Audit it from outside, against the deployed host, rather than trusting the local build —
a space row can exist on one tier and not the other, which is how this one hid:

```bash
curl -s https://di-studio.xyz/serverXR/api/spaces | python3 -c "
import json,sys
for s in json.load(sys.stdin)['spaces']:
    auto = s['isPublic'] and bool(s['publishedProjectId'])
    print(s['id'], 'custom' if s['previewImageAssetId'] else ('auto' if auto else 'BLANK'))"
```

Anything printing `BLANK` is a bug in this rule, not a space waiting for its owner.

**Files:** `src/studio/components/SpaceHub.jsx` (fallback order, upload, and the
"use live preview" reset), `src/services/serverSpaces.js` (`getServerSpaceAssetUrl`,
`uploadServerAsset`), `serverXR/src/routes/spaceRoutes.js` and `serverXR/src/spaceStore.js`
(`previewImageAssetId`).

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

### Playwright probe scripts stay out of the repo — import by absolute path

**Rule:** One-off browser probes (verification scripts, screenshot checks) live in
the session scratchpad, never the repo root, and import the repo's Playwright by
absolute path: `import { chromium } from '/home/nooo/di.iiii/node_modules/playwright/index.mjs'`.

**Why:** a bare `import 'playwright'` only resolves from inside the repo (ESM
ignores `NODE_PATH`), which is exactly why past sessions left `.detect.mjs`/
`.fin.mjs` littered in the repo root — the script had to live there to run.
The absolute import removes that excuse. Also: probe pages that hold SSE/WebSocket
connections never reach Playwright's `networkidle` — use `domcontentloaded` plus
an explicit wait, and avoid `page.screenshot()`'s font wait on pages with
`font-display: swap` (assert `document.fonts.status` instead).

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

### Memory is written at every boundary — including every compaction — or it is not written at all

**Rule:** The durable residue of a session goes into user memory (`~/.claude/projects/-home-nooo/memory/`) at every session boundary *and at every context compaction*, not once at the end. Write what is now **true**, never what you did. Update `MEMORY.md` in the same breath as the file — a memory file with no index line is invisible to the next session, because the index is what actually loads. Rewrite files, never append to them; past ~6 KB a memory has stopped being a fact and become an unread log that drags its whole bulk into context on recall. The full contract is the meta memory `meta_memory_sync.md`.

**Why:** The user reported on 2026-07-30 that memory collection wasn't working and that context kept going missing between sessions. It was true, and the cause was structural rather than a lapse: nothing *drove* memory. The only Stop hooks were `golden-rules-check.sh` (repo rules) and `sync-global-config.sh` (config backup) — neither touched memory, so writing it depended entirely on the model spontaneously deciding to, mid-task. The audit found `MEMORY.md` two days behind files that had been rewritten, `project_br_id_ge.md` grown to 17 KB of append-only paragraphs, and a multi-day di.iiii session (the Seed→Raw rename, the 27/22 node-gating decision) with zero memories written at all. This is the same failure the repo already recognized for golden rules ("capture mid-session, not at the end"), except worse: a golden rule can be reconstructed from `git log`, and a decision the user made in conversation cannot. Compaction is precisely where that context dies, so it is the moment to write, not a moment to survive.

**How:** At every boundary, ask four questions and write only what has a real answer — (1) what did the user decide that the code does not explain → `project_*`; (2) what did the user correct me on, and why → `feedback_*` with **Why:** / **How to apply:**; (3) what name/URL/path did I have to discover → `reference_*`; (4) what state can the next session not re-derive → `project_*` or `CURRENT.md`. If the repo already records it (code structure, past fixes, git history), it does not belong in memory. The Stop hook `un-di/templates/hooks/memory-sync-check.sh` runs globally and reports drift — index staleness, orphans in either direction, oversize files, prolonged silence — but it is non-blocking and cannot write for you; treat its output as a checklist, not a pass.

**Files:** `~/.claude/projects/-home-nooo/memory/meta_memory_sync.md` (the contract), `feedback_memory_recap_protocol.md`, `MEMORY.md` (the index that actually loads), `/home/nooo/un-di/templates/hooks/memory-sync-check.sh` (the Stop hook), `/home/nooo/.claude/settings.json` (where it's wired).

### A field that is only written when something is created is a field that will drift — declare the space, not just its pages

**Rule:** For any repo-linked di.iiii space, the repo declares the space itself in `di-space.space.json` — `label`, visibility, the tier map, and the list of project manifests that are supposed to exist — and `scripts/space-sync.mjs` reconciles those fields on *every* run, not at creation. Per-tier differences (staging's `openInscriptions:false`) are declared in that manifest's `tiers` block, so the intended difference can be told apart from drift; a tier marked `governed:false` (the dev box) is shown by the audit and never enforced. `--all` syncs every declared page in one command, `--audit` reads every tier and exits non-zero on any undeclared difference, and neither the sync nor the audit ever deletes: extras are reported, and removing one stays a deliberate `--prune` a person types.

**Why:** This is the same bug three times, each caught only by accident. v3 fixed the project **slug** — sent in the CREATE POST and nowhere else, so a tier that got its projects any other way had null slugs and answered 404 at the door the landing page linked to, with perfectly synced content behind it. v4 fixed the project **title** — same shape, so `di-space.field.json` said "the field — every crossing, together" while all three tiers went on saying "the field". Then on 2026-08-05 the user opened prod, staging and `localhost:5173` side by side and saw the space *itself* named three different things: `br_id_ge`, `br_id_ge`, and `br_id_ge XR_ Notations:vi.ritual`. The space label was still create-only, and worse, it was taken from whichever *page* manifest ran first — provisioning a fresh tier from `di-space.landing.json` would have named the whole space "the landing — the door". The audit that came out of it immediately found more than the label: the dev tier had null slugs on `rite` and `field`, the old `the field` title, `br-id-ge-needs` missing entirely, and 70 projects the repo does not declare. **The real defect was never any single field — it was that drift could only be discovered by a human with three browser windows open, which only ever checks the surfaces someone happens to look at.**

**How:** Put space-level truth in `di-space.space.json` and page-level truth in `di-space.<page>.json`; never let a page's `label` name the space. Add the field to `SPACE_FIELDS` / `TIER_FIELDS` in the engine so the reconcile, the audit and the docs cannot disagree about what "declared" means. Bump `ENGINE_VERSION`, then `npm run space:sync:release` — one command that writes the engine to every linked repo, bumps their `minEngine` to match, and commits + pushes each (the old two-step "`--write` then remember to commit and push three separate repos" is exactly where the real v5→v6 upgrade stalled uncommitted for 15+ hours on 2026-08-06). Run `--audit` in CI *after* the sync — a sync reporting success is not the same as tiers agreeing — and keep the audit read-only so it is safe to point at the live space. When adding any new create-time field to a space or project, write the reconcile in the same change; the guard that catches this class is asserting the PATCH exists, and it must be seen failing against the previous engine before it counts.

**A checked-out worktree is a runnable copy of every tool in the repo, including the ones that write outside it.** Eight copies of `space-sync-vendor.mjs` existed on one machine on 2026-08-06, two of them next to a stale v4 engine — running `--write` from either would have silently downgraded every linked repo and reported success (it did, once, while testing the fix). Any tool whose job is to write into a DIFFERENT repo must verify it is running from the canonical checkout before it writes anything — see `checkSafeSource` in `space-sync-vendor.mjs` and `docs/ai/space-sync-vendoring.md` for the full guard.

**Files:** `scripts/space-sync.mjs` (the engine: `SPACE_FIELDS`, step 1b, `audit()`), `scripts/space-sync.test.js` (the guards, including `minEngine === ENGINE_VERSION` for di.iiii's own spaces — strict equality, no lag excuse), `scripts/space-sync-vendor.mjs` (the guard + `--release`), `scripts/space-sync-selfcheck.mjs` + `docs/templates/vendor-check.yml` (vendored into each linked repo so drift can fail in a place that can actually see it), `docs/ai/space-sync-vendoring.md` (full reference), `br_id_ge/di-space.space.json` (the first space manifest), `br_id_ge/.github/workflows/sync-space.yml` (`--all` then `--audit`, gated on `vendor-check`), `docs/ai/known-fixes.md`.

**Same shape, one level up — a grant is not a preference, and a half-grant is worse than none.** On 2026-08-05 the identical defect turned up on the platform's own object: `ownerUserId` was written only in the `POST` that creates a space, and read from the *session* making the request. Every repo-linked space is provisioned by an API token, which has no session, so all 8 production spaces were `ownerUserId: null` — and `ownerUserId` was not in the PATCH field list, so there was no route back. The store had supported the update the whole time; no caller could reach it. Consequence: publish, invite, rename and delete all fell through to a platform admin, and one person was the bottleneck for every space in the product. Two things generalise from the fix. First, **ownership is admin-only** — an owner cannot hand their own space away, because a grant that the grantee can re-grant is not a grant. Second, **ownership and reach are two grants and must move together**: assigning `ownerUserId` without adding the space to that account's scope produced an owner who could not open their own space, so the route now does both in one call (scope best-effort, so it can never fail the ownership write). The same audit found `serverSpaces.js` silently dropping `slug` on the way out — Preferences → Manage had an "Edit public link" button that had never done anything, because the server supported the field and the client never sent it. **When you add a field to a route, check the client actually forwards it; a button that posts nothing looks exactly like a button that works.**

### A dev-server endpoint is not a save — if the surface ships, its writes have to ship with it

**Rule:** When an authoring surface is reachable from a deployed build, the thing it writes to must be reachable from a deployed build too. A Vite `configureServer` middleware, a `vite.config.js` plugin with `apply: 'serve'`, an `import.meta.env.DEV` branch — these are correct for writing *source files* and are never a save path for anyone but the person running the dev server. If the panel can be opened on di-studio.xyz, the panel needs somewhere on the server to put an edit.

**Why:** algovrithm's Director shipped exactly this way. It is a full timeline — clips, trims, worlds, lights — reachable from Studio's Spaces list on the live site, and its only "Save to source" POSTed `/__algovrithm/edit-list`, a dev-server middleware that patches `src/algoVrithm/sequences/index.js` in place. On the deployed site the button was there, it was pressable, and it wrote nothing: a collaborator could retime the whole piece and lose it on reload. It failed the way the worst defects fail — no error, no missing control, just work that quietly did not exist afterwards. The hole under it was structural, not specific: a **code space** (one whose scene is React in `src/` rather than a project document) had no server-side home for anything its author tunes, so every knob such a piece grows would land in the same trap.

**How:** Give code spaces a place to keep settings — `GET/PUT /api/spaces/:id/settings`, one small JSON blob beside the scene, namespaced per piece, bounded by size rather than by schema (what the keys mean belongs to the piece; a platform schema would need editing every time a piece grew a knob). Store an **overlay**, not a copy: only the fields a director actually moves, keyed by row id, diffed against what the file declares. A row also carries a Component, a backdrop and paragraphs of argument about why a beat is that length — none of that is data, and a copy would either drop it or freeze it. The file stays the source of truth and the overlay says how this tier differs, so reading the source still tells you what the piece is and clearing the overlay always lands back on it. Resolve the overlay **before** the piece's clock is built, on a deadline, ignoring a late answer: applied afterwards it jumps the playhead mid-beat, and a slow backend must cost frames, not the show. Keep the dev path first when it is there — patching the real source with its comments intact is strictly better than an overlay — and make the button say *which* of the two it just did, because they differ in whether the work survives a deploy.

**Files:** `serverXR/src/routes/spaceRoutes.js` (the settings routes), `src/services/spaceSettings.js`, `src/algoVrithm/timingOverlay.js` (the pure diff/apply), `src/algoVrithm/useSavedTiming.js` (the deadline), `src/algoVrithm/DirectorPanel.jsx` (the fallback and the wording), `docs/ai/known-fixes.md`.

### Working material is not documentation — the public repo is a product, not a desk

**Rule:** `dob-0/di.iiii` is public. Anything produced *while working* that is not part of the product does not go in it: funding applications, grant calendars, budgets and revenue models, named people and what was said to them, unsent drafts, anything with a deadline that is nobody else's business. That material lives in the private `di.iiii-ops` (`promo/`), the same pattern as `br_id_ge-ops`. Anything that helps someone **use, run or contribute to the platform** stays public — code, architecture, deploy runbooks, `known-fixes.md`, `golden_rules.md`.

**Why:** For weeks the public repo carried `docs/promo/` — a grant calendar with amounts, deadlines and contact emails (EMAP, Horizon Europe, ECHOES, Prix Ars, Venice College Immersive, FIVARS), a named warm-contacts table with a `☐ not contacted` tracker, the revenue model and membership pricing, and four written-but-unsent announcements. None of it was a credential, so no secret scan would ever have flagged it, and nothing was broken enough to notice. The cut that matters is not *secret vs not secret* — it is **product vs desk**. A stakeholder list is not dangerous; it is simply not the reader's business, and publishing your negotiating position before you negotiate is a cost you pay silently.

**How:** Cut **by kind, not by file**, so the boundary survives new files nobody has thought of yet. Resist the urge to sweep in infrastructure just because it sounds sensitive: deploy docs, the secret-*rotation* runbook, `/opt/di.iiii`, the VPS IP and the `ssh dii-vps` alias all stayed public — a self-hoster needs them, a public DNS record is not a secret, and moving `known-fixes.md` or `golden_rules.md` would break every agent that is instructed to read them. And be honest about what a move achieves: **`git rm` removes a file from `HEAD` and from nothing else.** Every version stays readable in the public history, so anything that was published must be treated as already seen — a rotation, a re-plan, or nothing, but never a pretence. Erasing for real means rewriting history and force-pushing a public repo, which is a separate, deliberate decision.

**Files:** `di.iiii-ops/README.md` (the boundary, with what did *not* move and why), `docs/ai/known-fixes.md`.

### A rule no build can see is a convention, not a protocol

**Rule:** When you write down a rule that every agent is told to obey, ask in the same breath what would fail if it were broken. If the answer is "a person notices", it is not enforced. The contract in this repo is enforced in two very different ways, and it is worth knowing which half you are standing on: **CI fails** on `lint`, `build`, `test`, `test:server-contracts`, `test:schema-sync`, `check:fallback-patterns`, `check:three-vendor`, `docs:ai:check` (canonical files, generated bridges, scoped `AGENTS.md`, forbidden private hosts, and CURRENT.md's line limit) and `docs:wiki:check` (articles and highlights resolve, no private hosts, and a **freshness gap** — user-facing code changing more than 7 days after the newest wiki article fails the build). **Nothing fails** on a missing `known-fixes.md` row, a missing regression guard, an un-updated `PROGRESS.md`, an idea not parked in `INBOX.md`, or a surface reported as done without being looked at.

**Why:** CURRENT.md opens with "≤50 lines. Read in full." — its own limit, in its own first line, and no check anywhere read it. On 2026-08-06 the file went over three times in one session, each time caught only because somebody ran `wc -l`. The rule had been in AGENTS.md for months and was true in exactly the way a wish is true. The check that now enforces it found the file at 51 lines the moment it was switched on.

**How:** Prefer a check to a paragraph, and make it cheap: the line-limit guard is nine lines inside `check-agent-docs.mjs`. When a rule genuinely cannot be automated — "you have not verified it until you looked at it" — say so explicitly where it is written, so nobody mistakes discipline for a tripwire. And **watch a new check fail before trusting it**: append junk, see the error, revert. A guard you never saw fire proves nothing about the day it matters.

**Files:** `scripts/check-agent-docs.mjs` (the enforced half), `scripts/check-wiki-sync.mjs` (the freshness gap), `.github/workflows/ci.yml` (what actually runs), `AGENTS.md` (where the unenforced half is written down).

---

### CURRENT.md states no commit SHA and no branch position

**Rule:** Never write a commit SHA or an ahead/behind count into CURRENT.md. Run `npm run state` (scripts/repo-state.mjs) for those facts instead.

**Why:** On 2026-08-06, two commits landed one minute apart from two different branches asserting contradictory positions for main — 682a556a said main is at 0b4b2b7f, 7a613c69 said dev and main level at ef6e1fe7. Neither agent lied; each transcribed a stale fact from its own worktree's view into a single-slot file. Derived facts belong to a live command, not hand-authored prose, because two branches can never disagree about what a command reports at the moment it runs.

**How:** scripts/check-agent-docs.mjs bans commit-SHA and ahead/behind patterns in CURRENT.md and is wired into both CI and the pre-push gate; .claude/commands/recap.md (repo-local) tells the recap flow to run npm run state instead of transcribing git log.

**Files:** `scripts/check-agent-docs.mjs, scripts/repo-state.mjs, scripts/repo-state-lib.mjs, .claude/commands/recap.md, CURRENT.md`

---

### CURRENT.md has exactly one writer: `npm run land`

**Rule:** Never edit `CURRENT.md` on a feature branch. Write session notes to `docs/ai/sessions/<branch-slug>.md` instead (see its README for the format) and let `npm run land` — run on `dev`, at merge time — fold them into `PROGRESS.md` and rewrite `CURRENT.md`'s "Last session" from them.

**Why:** The SHA/ahead-behind ban above fixed *what* got written into CURRENT.md; it did nothing about *when* or *by whom*. Every branch was still pre-writing what it guessed `dev` would look like once merged, and `CURRENT.md`'s own "replace, don't append" convention meant whichever branch wrote last won — silently destroying whatever the previous writer had recorded. Confirmed on 2026-08-06: three separate sessions' real notes were permanently overwritten this way before their branch ever merged, recoverable only via `git fsck --dangling` (which nobody would think to run) — one of them was on this very rule's own commit, caught while writing it. A single-writer point, naturally serialized by git (only one branch can be `dev` at a time), closes the race that a naming convention alone cannot.

**How:** `docs:ai:check` enforces the shape: `CURRENT.md` must contain the literal `active_branch: dev`; a branch off `dev`/`main` must have a matching session note before pushing, and its `CURRENT.md` must not differ from `origin/dev`; `dev`/`main` themselves must have an empty `docs/ai/sessions/` (forces the fold-in — cleanup is part of landing, not a courtesy). `.claude/commands/recap.md` writes the note; `.claude/commands/land.md` runs the fold.

**Files:** `docs/ai/sessions/README.md, scripts/session-land.mjs, scripts/session-land-lib.mjs, scripts/check-agent-docs.mjs, .claude/commands/recap.md, .claude/commands/land.md`

---

### One worktree per task; landing sweeps it, not memory

**Rule:** Before starting a fan-out or a new worktree, run `npm run state` and check the count. `npm run land` (see above) sweeps merged/clean/non-live worktrees automatically at merge time — a worktree that survives a landing needs a reason (still live, still unmerged, or dirty), not a reminder to someone.

**Why:** By 2026-08-06 there were 21 worktrees: 3 prunable with their /tmp scratchpad directories already deleted, one detached and stale at a commit from the previous day, and 17 branches sitting unmerged into dev. Nothing reported this — agents only discover it by accident, usually when a worktree they need is already locked by another one (git worktree add fails with 'already used by worktree at ...'). A cleanup step that depends on someone remembering to run it is the same shape of unenforced rule as the CURRENT.md line limit was before a check existed for it.

**How:** `scripts/repo-state.mjs` prints the live worktree count and flags prunable/detached/live entries every session (wired into the SessionStart hook via `--brief`); `--sweep` removes only what `classifyWorktree`/`isSweepSafe` agree is safe (merged by `git cherry`, not just `merge-base` — catches squash merges — clean, and no live process bound to it via `/proc` scan), never `--force`, and names the exact reason + override command for everything it leaves alone. `npm run land` runs it as its last step.

**Files:** `scripts/repo-state.mjs, scripts/repo-state-lib.mjs, scripts/session-land.mjs, docs/ai/parallel-agents.md`

---

### A screenshot referenced by path is not a screenshot you have

**Rule:** When a bug report points at a screenshot by filesystem path instead of pasting it inline, read that path as the very first action, before anything else — including before reading the rest of a multi-image message. Do not batch it in with other reads a few tool calls later.

**Why:** On 2026-08-06 a user pasted one screenshot inline and referenced two more by path (`/tmp/Spectacle.XXXXXX/Screenshot_*.png`) in the same message. By the time they were read — one reply-turn later, after other embedded work — one path's directory no longer existed and the other's was empty. Screenshot tools like Spectacle write to a fresh temp directory per capture and clear it aggressively, sometimes within the same minute. The content was gone for good: no `find`, no re-request to the same path, nothing recovers it. The two bugs those screenshots showed had to be re-derived by manual reproduction instead, burning most of a session on rediscovering what a single timely read would have shown directly.

**How:** This is unenforced — a person (or a stale temp path) is the only thing that notices when it's skipped, the same shape as the verification rule in "A rule no build can see is a convention, not a protocol" above. Treat it with the same discipline: image-by-path references are perishable evidence, not durable input. Read first, investigate second. If a path is already gone when you get to it, say so plainly and ask for a resend rather than guessing at what it showed.

**Files:** none — process discipline, not code.

---

### Work has one home, and it is in a repo — the home rule

**Rule:** Every durable work product lands inside the ecosystem, in the same
effort that produced it: research → `docs/research/<yyyy-mm-dd>-<topic>.md`
(update the existing file on a topic — never re-buy it); durable agent rules →
this file; product truth → the wiki; running state → session notes folded by
`npm run land`. External surfaces (a claude.ai artifact, a status page) are
MIRRORS only: the in-repo file is the source of truth and records the mirror's
URL. A session may run local servers for its own verification, but they die
with the session and are never handed to a person as a deliverable — if
someone must see it live, it goes to staging or into the product itself.
Anything meant to outlive the session that listens on a port is an infra fact
and gets recorded in di-atlas before it starts.

**Why:** On 2026-08-21 a ten-agent UX audit (~1M tokens) delivered its ledger
into a session-scratchpad directory, its plan onto claude.ai, and its live
status onto an ad-hoc `localhost:8377` server — three homes, none of them
di.iiii, all gone or unreachable the moment the session ends. The owner's
words: "we burn credits work but info is not have the right path to
ecosystem." Credits buy information; information that does not land in the
repo has to be bought again. The same failure shape as the pre-2026-08-06
CURRENT.md races: work happening, nothing durable owning the result.

**How:** Largely process discipline, backed by two structural pieces:
`docs/research/` exists with a README stating the ledger convention, and
`docs/ai/RESEARCH_METHOD.md` names it as the required destination (rule 4).
When reviewing a PR that contains research or a decision, ask where its file
is; when a session offers a URL, ask whether the ecosystem owns it.

**Files:** `docs/research/README.md, docs/ai/RESEARCH_METHOD.md`

### A document page in this app must be its own scroll container

**Rule:** Any page that is a document rather than a viewport — legal text, a
wiki article, a poster page — sets `height: 100%; overflow-y: auto` on its own
root. Never `min-height: 100vh`.

**Why:** `src/styles/base.css` pins `html, body, #root` to `position: fixed;
height: 100%`, because the app is an editor that owns the viewport and must not
scroll behind its panels. A page written the ordinary way therefore lays out
correctly, paints correctly, screenshots correctly at viewport height — and
silently cannot be scrolled. Nothing fails: no console error, no failing test,
and `fullPage` screenshots come back the height of the viewport, which looks
like a short page rather than a broken one. `/garage` shipped this bug and it
was caught only by scrolling the real page in a browser.

**How:** Copy the shape `src/pages/legal.css` already uses. Two follow-ons: a
`position: sticky` bar inside that container needs the container to carry **no
top padding**, or content scrolls past visibly in the strip above it; and a
modal that locks scrolling must toggle the class on the page root, since
`body { overflow: hidden }` locks an element that was never scrolling.

**Files:** `src/styles/base.css, src/pages/legal.css, src/garage/garage.css`
