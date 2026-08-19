# Dependency Decisions

Standing verdicts on dependency upgrades that look overdue but aren't. Each row
was investigated and *deliberately* not taken. Read this before "just bumping"
anything here — every entry below is a trap someone already stepped in.

Re-check on the stated trigger, not on a hunch.

## The CI gate

`.github/workflows/ci.yml` runs:

```bash
npm audit --production --audit-level=high
npm --prefix serverXR audit --production --audit-level=high
```

**Production deps only, high and above.** Dev-only advisories never block a
deploy no matter how loud `npm audit` is when you run it bare. Before treating
an advisory as urgent, re-run it the way CI does — `npm audit --omit=dev
--audit-level=high` — and check the exit code.

Status as of 2026-07-28: **exit 0**, both workspaces.

---

## `@react-three/drei` 9 → 10 — blocked on React 19, not a bump

Long carried as "drei 9→10 fails CI". It isn't a dependency problem:

```
drei@10  → peer @react-three/fiber ^9.0.0
fiber@9  → peer react ^19.0.0 / react-dom ^19.0.0
app      → react 18.3
```

So the upgrade is a **React 18 → 19 migration** wearing a dependency's clothes,
and it drags MUI 7, the whole R3F surface, and every test using
`@testing-library/react` with it. That's a project with its own plan, not a
backlog chore.

There is **no security advisory on drei 9** — urgency is zero. Do not attempt
this piecemeal; a partial bump just produces peer-conflict noise.

**Re-check when:** React 19 migration is scheduled on its own merits.

---

## `react-router-dom` 6 → 7 — the upgrade makes CI *worse*

Two moderate advisories sit on 6.30.3:

| Advisory | Reachable here? |
| --- | --- |
| [GHSA-jjmj-jmhj-qwj2](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2) / [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) — open redirect via backslash in `<Link>`/`useNavigate` | **No.** Requires a user-controlled destination. All 23 `appNavigate()` call sites pass literals or `build*Path()` builders over validated ids; there is no `<Link to={…}>` with a non-literal target anywhere in `src/`. |
| [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) — arbitrary constructor injection via `deserializeErrors()` | **No.** SSR-hydration only. The app is a pure Vite SPA — no `hydrateRoot`, `StaticRouter`, or `renderToString` in `src/` or `serverXR/`. |

No 6.x patch exists — 6.30.4 is the last 6.x and is still in range. The fix
ships only in 7.18.0+.

**Tried it (2026-07-28): 7.18.1 installs clean, lint and build pass — the API
surface is only `BrowserRouter`, `useLocation`, `useNavigate` across 2 files,
all unchanged in v7. Then `npm audit --omit=dev` goes from 2 moderate to
2 HIGH:** [GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2),
RSC-mode CSRF bypass, range `7.12.0 - 8.2.0`. Also unreachable (no RSC), but
**high severity trips the CI gate and blocks deploys.** There is no clean
version: 7.11.0 dodges the high but keeps the moderates.

Verdict: **stay on 6.30.3.** Strictly better — same real-world exposure (nil),
and CI stays green.

**Re-check when:** react-router ships a release above 7.18.0 with the RSC CSRF
advisory resolved. Then it's a genuinely free upgrade — take it.

---

## eslint 9 → 10 — TAKEN 2026-08-19 (was parked; taken on a narrower route than the park allowed)

**Resolved. 10.8.1 is in, and it clears 6 of the 7 highs — not all 7.**
`npm audit` in this tree now reports **one** `brace-expansion` high, down from
seven. eslint's own chain (`eslint`, `@eslint/eslintrc`, `@eslint/config-array`,
`minimatch@10`) resolves `brace-expansion@5.0.9`, which is patched. The survivor
is `eslint-plugin-jsx-a11y` and `eslint-plugin-react` → `minimatch@3.1.5` →
`brace-expansion@1.1.16`, and it stays until those two plugins drop minimatch 3.
Still dev-only, still never bundled, still outside the CI gate.

**The park condition did NOT fire — this was taken anyway, deliberately.** Neither
plugin declares an eslint 10 peer: `eslint-plugin-react@7.37.5` (latest) still
caps at `^9.7`, `eslint-plugin-jsx-a11y@6.10.2` (latest) at `^9`. Instead of
`--legacy-peer-deps` — which the old verdict forbade, and rightly, because it
disables peer checking for the *whole* install — the peer is forced for exactly
those two packages:

```json
"overrides": {
    "eslint-plugin-jsx-a11y": { "eslint": "$eslint" },
    "eslint-plugin-react":    { "eslint": "$eslint" }
}
```

This is what the old verdict's ban was protecting against, scoped down to two
packages instead of the whole tree. The `brace-expansion` override it also
banned is still not present — that ban stands untouched.

**One real incompatibility surfaced and was fixed.** `eslint-plugin-react`'s
`version: 'detect'` auto-detection calls `context.getFilename()`, removed in
ESLint 10, so lint died on the first file. `eslint.config.js` now pins
`react: { version: '18.3' }` to match `package.json`. Keep the two in step.

**The residual risk, stated plainly:** the plugins are running against a major
they do not claim to support. `npm run lint` across `src serverXR scripts shared`
is green — 0 errors, 31 pre-existing warnings, same as on eslint 9 — so every
rule this repo actually exercises works. A rule that isn't currently triggered
could still break on some future file. That failure mode is a **loud lint error
in CI**, never a silent production bug; eslint does not ship.

**Re-check when:** `eslint-plugin-react` and `eslint-plugin-jsx-a11y` declare an
eslint 10 peer. Then delete both `overrides` entries — not before, or the install
goes back to failing peer resolution.

**Historical — why it was parked (2026-07-28):**


Bare `npm audit` reports 7 highs. All 7 are one root cause —
[GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg),
`brace-expansion` DoS — reaching `eslint`, `@eslint/eslintrc`,
`@eslint/config-array`, `minimatch`, `eslint-plugin-react`,
`eslint-plugin-jsx-a11y` transitively.

`eslint` is a **devDependency**. It is never bundled into `dist/`, never runs on
the VPS, and is excluded from the CI gate. Exploiting it means feeding a hostile
glob pattern to your own lint run.

Both escape routes are closed:

- **Override `brace-expansion`.** Advisory range is `<=5.0.7`; only 5.0.8 is
  patched. Tried it — `minimatch@3.1.5` does `var expand = require('brace-expansion')`
  and calls it, but v5 exports `{ expand }`. Lint dies instantly with
  `TypeError: expand is not a function`. No patched version is API-compatible
  with minimatch 3.
- **Upgrade to eslint 10** (npm's suggested fix). `eslint-plugin-react` caps its
  peer at `^9.7` and `eslint-plugin-jsx-a11y` at `^9` — *at their latest
  releases*. Upgrading means `--legacy-peer-deps` on the lint toolchain to
  silence a dev-only DoS. Not worth it.

Verdict at the time: **accept.** Do not add `--legacy-peer-deps`, and do not
add an `overrides` entry for `brace-expansion` — it has already been proven to
break `npm run lint`.

**Re-check trigger (superseded 2026-08-19):** `eslint-plugin-react` and
`eslint-plugin-jsx-a11y` both declare an eslint 10 peer. It never fired; the
bump was taken via scoped overrides instead — see the top of this section.

---

## MUI 7 → 9 (#87/#85) — a styling-engine migration, not a bump

MUI 9 *does* accept React 18 (peer `^17 || ^18 || ^19`), so it is not blocked
the way drei is. What blocks it: v9 adds a **required peer
`@mui/material-pigment-css`** — the Emotion → Pigment CSS build-time styling
migration. MUI is used across the whole Studio shell (StudioApp, StudioEditor,
SpaceHub, LandingPage, auth surfaces…), and the golden rule is *preserve
existing UI exactly*. A styling-engine swap under every surface needs its own
visual-regression pass, not a dependabot merge. No security advisory on MUI 7.

**Re-check when:** scheduled deliberately, ideally together with the React 19
migration (see drei above) since both rewire the same component surface.

---

## node 22-alpine → 26-alpine (#66/#67) — wait for 26 LTS

CI is green on both, but Node 26 is **Current, not LTS** until ~Oct 2026, and
node 22 is in maintenance until April 2027 — urgency is zero. Prod runtime
stays on even-LTS.

**Re-check when:** Node 26 enters Active LTS (Oct 2026) — then take both PRs
together (root + serverXR images must move in the same deploy).
