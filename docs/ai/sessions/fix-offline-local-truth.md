# fix/offline-local-truth

## 2026-08-10 — a local install now tells the truth about being one

- The offline/local fix set from the cross-machine audit, minus the `di up`
  update-check pair — that one is already fixed on `fix/di-offline-update-check`
  (another session's branch) and was deliberately left there. `install.mjs`'s
  `smokeTest` temp-dir cleanup cosmetic was deferred with it, since those files
  are that branch's.
- `local: DI_LOCAL === '1'` surfaced on `/api/auth/session` AND `/api/config`
  (the landing reads config so it never mints a guest session just to learn
  where it runs). Landing swaps "Sign in only to edit" / "3 free spaces" for
  local-truthful copy when `local && !requireAuth`.
- The access-restricted card got doors: "Open Space" + "Your private sandbox"
  buttons and the shared OAuth sign-in block; raw session ids no longer print.
  A mistyped space id (server 404) now says "Nothing lives at …" instead of
  scope language — `useSpacePublicFlag` reports `exists`, failing safe to true
  on non-404 errors. Verified in a real browser, desktop and 390×844 DPR3.
- Typed bare `/raw` no longer walls guests: routing marks a *defaulted* space
  (`isDefaultSpace`) and `LaneDefaultSpace` bends only those to the session's
  `openSpaceId`. URL-named spaces keep their (door-bearing) wall.
- Guest cookie TTL now equals the sandbox sweep TTL (`config.sandboxTtlMs`,
  7d) instead of promising 30 days over a room swept at 7. Wiki corrected.
- `decideMode` prefers node over a merely-running Docker Desktop — docker is
  explicit (`--docker`) or last resort. **Behavior change**, install-time only;
  recorded modes never flip. Docker mode also composes BOTH compose files now
  (the `.di` file is only an override; alone, the named data volume never
  existed) and the base file ships in the runtime tarball.
- CI's offline job now asserts `"requireAuth":false` on the session endpoint —
  the SPA-shell grep it had could not fail for a walled install.
- Reconnect drips capped: scene/project SSE close after 3 straight errors and
  sit out the shared 15s cooldown; presence socket.io gets
  `reconnectionDelayMax: 15000`.
- Offline CDN leaks closed: every drei `<Text>` names a vendored static Inter
  woff (32 KB, instanced from the woff2 the 2D UI already ships) instead of
  troika's jsdelivr resolver; XR controller/hand models turn off only when the
  session says `local`. Verified with jsdelivr blocked in a real browser.
- Docs truth: DI_CLI.md (network claim, node-first decision, compose pairing),
  wiki local-install article (+ docker caveat in the Claude-node article,
  guest-week truth in the invite article), v1-studio-feature-map's stale "no
  offline requirement yet" row, and the all-nodes example's browser panel now
  points same-origin (`/wiki`) so it opens offline.
- Adjacent finding, deliberately not fixed here (needs a decision): `npm run
  dev` binds 0.0.0.0 with auth off and CORS `*`, and the config warning names
  only the auth half.
