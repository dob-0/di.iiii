# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

---

## Last commit

`d68b665` — fix: sync shared/projectSchema.cjs with ESM source (deleteNode cascade)
Branch: `dev` = `staging` = `cpanel-staging` — staging.di-studio.xyz is live.

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Beta topbar: hidden until Node 0 is placed (Node 0 is the seed that awakens the UI)
- World node (`universe.world`): panel window with embedded 3D scene, fullscreen mode, overlay mode (3D behind graph)
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y)
- Auth: session-cookie login, role-based access, 8 s timeout
- Deploy: push to `staging` → GitHub Actions `publish-cpanel-prebuilt-v2.yml` → builds → pushes `cpanel-staging` → cPanel auto-deploys
- Docker: `docker compose up --build -d` runs full stack locally on port 8080 (Podman-compatible)

## What is broken / open

- `deploy-staging-ssh.yml` always fails (SSH secrets not in GitHub) — ignore it, cPanel pipeline is the real path
- Browser back/forward can be inconsistent (mixed history: react-router `navigate` + raw `pushState`)

## Known fixes — check here before investigating

| Symptom | Root cause | Fix | File |
|---------|-----------|-----|------|
| White screen / TDZ crash in prod | `manualChunks` missing drei peer deps → circular chunk init order | All drei peer deps in `three-vendor`: `detect-gpu`, `maath`, `camera-controls`, `@monogrid/gainmap-js`, `@react-spring/three` | `vite.config.js` |
| Infinite loading / auth never resolves | No timeout on session fetch | `AbortController` 8 000 ms timeout | `src/hooks/useAuthSession.js` |
| 100+ cascade errors when backend is 503 | `requireAuth` stays false → `AuthGate` skips error screen | Error check moved before `!requireAuth` | `src/components/AuthGate.jsx` |
| Page does not change after clicking a link | `navigateToBetaPath` uses raw `pushState` + synthetic `popstate` — this is correct | Do not replace these helpers | `src/beta/utils/betaRouting.js` |
| Graph nodes stop at left edge while dragging | Drag clamped `x >= 0` | Allow overflow left, clamp top/right only | `BetaGraphSurface.jsx` `DesktopWindow.jsx` `windowLayout.js` |
| Staging serves old build after push | Actions workflow still running | Wait 2–3 min: `gh run list --workflow publish-cpanel-prebuilt-v2.yml` | `.github/workflows/` |
| `assetId is required` on upload | Dead `|| crypto.randomUUID()` fallback removed | SHA-256 must be computed before calling `buildProjectAssetMeta` | `serverXR/src/projectStore.js` |
| 503 after deploy (server crashes on start) | `shared/projectSchema.cjs` out of sync with `src/shared/projectSchema.js` | Always update both files together; CJS is what serverXR actually loads | `shared/projectSchema.cjs` |

## Deploy

```bash
git checkout staging && git merge dev --no-edit && git push origin staging && git checkout dev
gh run list --workflow publish-cpanel-prebuilt-v2.yml
```

## Validation

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```

**Rule:** When you solve something that took >5 min to find, add a row to Known fixes and update Last commit.
