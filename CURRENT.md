# Current State

**Every AI reads this before anything else. It is ≤50 lines. Read it in full.**
Updated at the end of every session. Replace content — do not append.

---

## Last commit

`78ebe44` — feat: react-router-dom routing, bundle TDZ fix, auth timeout  
Branch: `dev` = `staging` (both at `78ebe44`)

## What works

- Studio editor: project hub, 3D scene, inspector, assets, spaces
- Beta editor: node graph, wiring, World/Graph/View surfaces, outliner, undo/redo
- Auth: session-cookie login (`AuthGate`), role-based access, 8 s timeout on session fetch
- Storage: SQLite for all metadata, filesystem for binary assets
- Deploy: `npm run deploy:staging` → pushes to `origin/staging` → GitHub Actions builds `cpanel-staging` → cPanel serves it

## What is broken / open

- Browser back/forward can be inconsistent (mixed history: react-router `navigate` + raw `pushState`)
- No undo/redo in Studio editor (Beta has it)

## Known fixes — check here before investigating any error

| Symptom | Root cause | Fix | File |
| ------- | --------- | --- | ---- |
| `Cannot access 'X' before initialization` / white screen in prod | `manualChunks` missing drei peer deps → circular chunk init order (TDZ) | All drei peer deps **must** be in `three-vendor` group: `detect-gpu`, `maath`, `camera-controls`, `@monogrid/gainmap-js`, `@react-spring/three`. Build must show **no circular chunk warning**. | `vite.config.js` |
| Infinite loading spinner / auth never resolves | No timeout on session fetch — hangs if backend is slow/down | `AbortController` with 8 000 ms timeout in `useAuthSession.js` | `src/hooks/useAuthSession.js` |
| 100+ cascade console errors when backend is 503 | `requireAuth` stays `false` (default) when fetch fails → `AuthGate` skips error screen and renders the app → every API call fails | Error check was moved **before** `!requireAuth` check in `AuthGate` — now shows "Backend unavailable" + Retry when backend is down | `src/components/AuthGate.jsx` |
| Page does not change after clicking a link / navigation broken | Wrong assumption: `navigateToBetaPath` / `navigateToStudioPath` use raw `pushState` + synthetic `popstate` — react-router **does** pick this up correctly | Do not replace these helpers. `BrowserRouter` listens to `popstate` and reads `window.location`. | `src/beta/utils/betaRouting.js` `src/studio/utils/studioRouting.js` |
| Beta graph/view nodes stop at the left edge while dragging | Drag math clamped graph `x` to `>= 0` and DesktopWindow clamped view window `x` to the viewport padding | Remove the graph drag clamp and allow view windows to overflow left while still clamping top and right edges | `src/beta/components/BetaGraphSurface.jsx` `src/beta/components/DesktopWindow.jsx` `src/beta/utils/windowLayout.js` |
| Staging still serves old build after push | GitHub Actions `publish-cpanel-prebuilt-v2` hasn't finished yet, or cPanel cron hasn't pulled | Wait 2–3 min, then: `gh run list --workflow publish-cpanel-prebuilt-v2.yml` to verify | `.github/workflows/publish-cpanel-prebuilt-v2.yml` |
| `assetId is required` server error on upload | Old code had `\|\| crypto.randomUUID()` fallback — removed intentionally | Upload routes must compute SHA-256 **before** calling `buildProjectAssetMeta` | `serverXR/src/projectStore.js` |

## Deploy commands

```bash
npm run deploy:staging      # dev → origin/dev + origin/staging (triggers GitHub Actions)
npm run deploy:production   # staging → origin/main
gh run list --workflow publish-cpanel-prebuilt-v2.yml   # check build status
```

## Validation (run before every commit)

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```

---

**Rule for all sessions:** When you solve something that took more than 5 minutes to find, add a row to the Known fixes table above and update the "Last commit" line.
