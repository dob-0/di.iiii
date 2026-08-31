## 2026-08-19 — react-router-dom 6.30.4 → 7.18.2, the park condition fired

- The bump was parked since 2026-07-28 because every 7.x carried GHSA-qwww-vcr4-c8h2
  (RSC CSRF, high) and high severity trips the CI gate. 7.18.2 is the first patched
  release — the advisory range ends exactly there. `npm audit --production
  --audit-level=high` now reports 0 vulnerabilities on the root and on `serverXR`,
  re-run by hand and confirmed, so the gate that blocked this is green and the two
  moderates that sat on 6.30.x are gone with it.
- Zero code changes. The whole react-router surface here is `BrowserRouter`,
  `useLocation` and `useNavigate` across `src/RootApp.jsx` and `src/hooks/useAppRoute.js`
  — all unchanged in v7. None of the v7 future flags apply: there are no `<Routes>`,
  no data router, no loaders. `docs/ai/dependency-decisions.md` records why, flag by flag.
- Verified by looking, not by inference. `npm run verify:surfaces` and
  `verify:surfaces:mobile` were run against this branch's own dev stack after merging
  `dev` in: 24 of 25 device × page combos clean, 0 horizontal overflow everywhere. The
  landing, `/wiki`, `/studio` and `/raw` screenshots were opened and read — Raw's starter
  desk still wires Sky into World and paints the room, on desktop and on iPhone.
- The 5 failing combos are all `/main`, all the same 401/403 on
  `/serverXR/api/spaces/main`. That is a local dev database with no `main` space and a
  guest session, not a router regression — the local Spaces list holds only `open` and
  `sandbox`.
- Left deliberately undone: `react-router-dom` is a deprecated re-export shim in v7 and
  is removed in v8. Renaming to `react-router` and rewriting the two imports belongs to
  the v8 upgrade — it would also move the package Dependabot tracks.
- Supersedes Dependabot PR #150, which bumps the same package but is not rebased on
  current `dev` and carries no decision record.
