# di.iiii Cheatsheet

Quick reference. Full context: `CURRENT.md` (read it first) → `AGENTS.md` → `docs/ai/known-fixes.md`.

## URLs (after `npm run dev`)

| What | Where |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000/serverXR |
| Full Docker stack | http://localhost:8080 (`docker compose up --build -d`) |

## Commands you'll actually use

```bash
npm run dev                          # start frontend (5173) + backend (4000)
npm run dev:browser                  # same, but also opens a fresh wiped Chromium profile
                                      # (closes/wipes on Ctrl+C — needs flatpak Chromium, Linux only)
npm run lint                         # eslint src/
npm run build                        # vite production build
npm run test -- --run                # full vitest suite
npm run test:server-contracts        # API contract tests (not in CI — run manually)
npm run test:schema-sync             # guards shared/*.cjs vs src/shared/*.js drift (not in CI)
npm run space:pull -- <spaceId>      # pull a space from the live server (local-write only, safe)
npm run space:push -- <spaceId> --dry-run   # ALWAYS dry-run first; real push writes to production
```

## Before you start working

1. Read `CURRENT.md` in full (≤50 lines) — last commit, what works, what's broken.
2. Check `docs/ai/known-fixes.md` before investigating any bug — it's probably already solved there.
3. Find your role: `AGENTS.md` → "Role Assignment" table routes you to a role card (CSS → UI/UX, Three.js → 3D/Viewport, auth/DB → Backend, etc.).

## Before you stop working

1. Update `CURRENT.md`'s "Last commit"/"Last session" section (replace, don't append).
2. If you solved something that took >5 minutes, add a row to `docs/ai/known-fixes.md`.
3. Add a dated entry to `PROGRESS.md` if the session did anything non-trivial.

## Safety

- Never run `space:push` without `--dry-run` first — it can write to production (`di-studio.xyz`).
- Never commit `.env`/`.env.local` files or print their values.
- `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production). Don't start routine work on `main`.
