## 2026-09-10 — the WCC landing, standing in its own space as a project

### The ask

The owner opened `/wcc/studio`, counted eleven projects (`main` plus ten artists), and
asked why the WCC **landing page** was not among them. It is not a project — it is
compiled React at `src/wccSite/landing/`, mounted only at the bare `/wcc` route
(`src/works/works.js`) — so the space's own list could never show it. Told a database
copy becomes a second source of truth that can drift from the code, he chose the copy
anyway: **"ok recreate and make it as a project."**

### What exists now

Two new `code` projects in the `wcc` space, **on the owner's LOCAL tier only**
(`https://local.thedi.studio`) — nothing written to staging or production:

- `landing-page-snapshot` — the landing, compiled through
  `src/wccSite/landing/snapshotEntry.jsx` from the exact `LandingPage.jsx` the real
  route renders. Not retyped.
- `artists-works-page-snapshot` — `public/wcc/artist-works-land/index.html`, Emily's
  hand-made page, currently reachable only inside the landing's iframe and nothing
  else linking to it. Given its own row for the same reason `/wcc/projects` exists at
  all: a space should show everything inside it, and a distinct authored page that
  nothing links to is exactly the class of thing that page was built to surface.

Both carry a visible **"Snapshot · taken 10 Sept 2026 · the live page is at ..."**
mark (bottom-left, fixed) and the date in the title, per `docs/ai/vocabulary.md` — a
copy that looks exactly like the live page forever is the drift risk wearing a
disguise.

Built by `scripts/wcc-page-snapshot.mjs` (`npm run wcc:page-snapshot -- --to <url>
[--token <token>] [--only landing|artist-works] [--out <dir>] [--dry-run]`), which:

- compiles the landing through a throwaway `vite build()` call (lib/iife mode, one
  JS + one CSS file — a snapshot travels as strings in a JSON document, so a chunk
  graph of URLs that don't exist is useless);
- rehosts the artist-works HTML byte-for-byte, only absolutising its own
  relative asset paths (`./x` and bare `x` alike — see the bug below);
- writes the same document shape `scripts/space-code-push.mjs` and
  `serverXR/src/spaceSyncPlan.js` write (`PUT .../document`, `entryView: 'code'`,
  `codeFiles`), reusing that mechanism's lessons rather than reinventing them, but
  going through `POST /api/spaces/:id/projects` first — `space-code-push.mjs` targets
  a space's ONE existing/first project, which here would have overwritten an artist's
  work.
- refuses a default target the same way `space-code-push.mjs` does — no
  `DEFAULT_LIVE_URL` that can push to prod by accident.

Media is referenced, not inlined: every image the landing shows already lives under
`/wcc/` on any tier that carries the work (a root-relative path resolves against
whichever tier's origin is hosting the shell, `src/utils/presentationPreviewDocument.js`),
so each project is a few hundred KB to 1.1 MB, not the 25 MB `public/wcc/` holds. Only
the webfonts are inlined (vite-bundled, no stable public address).

### Three real bugs, found only by opening the built snapshot in a browser

Schema validation and a green test suite proved nothing here — see below for why each
one was silent. All three are fixed on this branch, none are cosmetic:

1. **`src/utils/codeFilesBundle.js`** — `inlineLocalCss`/`inlineLocalJs` passed the
   inlined file content as a **string** to `String.replace()`, which gives `$&`,
   `` $` ``, `$'`, `$$` and `$<n>` special meaning in a string replacement. A real
   bundle (React, GSAP — anything with its own `.replace(/x/, '$1')` call buried
   inside it) contains these by accident, not by construction: landing.js had 7
   `` $` `` and 29 `$$`. `` $` `` alone spliced the ENTIRE preceding document back
   into itself at that point, truncating the actual `<script>` tag — the built page
   opened to a blank body with the rest of the 1.6 MB bundle sitting on the page as
   plain visible text and `SyntaxError: Unexpected identifier 'object'` in the
   console. Fix: pass a replacer **function** to `.replace()` — its return value is
   inserted literally, no reinterpretation. Regression guard:
   `src/utils/codeFilesBundle.test.js` (asserts `$`-bearing content round-trips
   byte-for-byte; fails against the pre-fix code). This bug affects **any** code
   project whose inlined JS/CSS happens to contain those sequences, not just this one.

2. **`scripts/wcc-page-snapshot.mjs`'s vite build had no `process.env.NODE_ENV`
   define.** The app's own `vite.config.js` never sets one either — it relies on the
   vite CLI's own default mode wiring, which a hand-built `vite.build({ configFile:
   false, ... })` call skips entirely. `process.env.NODE_ENV` survived into the
   bundle as a literal; `process` doesn't exist in a browser, so React (and
   everything else gated on it) threw `ReferenceError: process is not defined` the
   instant it evaluated — the whole app never mounted, silently, leaving only the
   snapshot banner on an otherwise blank page. Fix: `define: { 'process.env.NODE_ENV':
   JSON.stringify('production') }` in that build call. Also shrank the bundle
   1.6 MB → 1.1 MB, since dead `if (process.env.NODE_ENV !== 'production')` branches
   could finally be eliminated.

3. **`serverXR/src/index.js` `CODE_PAGE_READABLE`** did not include `wcc`. The
   landing's "About" panel loads thirty `/wcc/process/*.jpeg` photos into WebGL
   textures for its R3F scatter field (`ProcessField.jsx`) — a CORS-mode fetch, the
   same class as the Draco decoder this allowlist already exists for — and the
   sandboxed srcdoc iframe's origin is the literal string `"null"`. `/wcc` itself was
   never sandboxed before (it's always the top-level page), so nothing had needed
   this. Without it: 30 silent CORS errors and an empty gallery — the single part of
   the landing flagged in the brief as "the obvious candidate that might not
   survive." **It does survive** — this was the only thing standing between it and
   working. Fixed by adding `wcc` to the same regex four other directories already
   share. Guard: `src/codePageCors.test.js` (new case) and
   `serverXR/src/httpContracts.test.js` (new case, actual HTTP behavior against a
   real server). **Node-only.** `nginx.conf`'s equivalent allowlist for staging/prod
   does NOT include `wcc` — left alone deliberately (out of scope: this session
   writes to the local tier only, and nginx.conf's location-block ordering isn't
   something to touch un-tested). The same gap will reproduce on staging/prod the day
   this ever deploys there; whoever does that add one line to
   `location ~ ^/(vendor|fonts|draco|basis|unicode-fonts)/` in `nginx.conf`.

4. **`src/wccSite/landing/LandingPage.jsx`'s route-section open/close** called
   `window.history.pushState`/`replaceState`/`back()` directly. Those throw a
   `SecurityError` for ANY url in an opaque-origin document — even one that
   round-trips to the same nominal path — because there's no concrete origin left to
   compare against, and the sandboxed snapshot is exactly such a document. The panel
   still opened (React's state update from the same click handler still commits),
   but every open/close logged an uncaught `SecurityError` to the console — a real
   defect, not cosmetic, and one that would hit the SAME component the day it's ever
   embedded anywhere else opaque. Fixed with a small extracted helper,
   `src/wccSite/landing/safeHistory.js` (`safeHistoryCall`, try/catch, same tradeoff
   `presentationPreviewDocument.js` already makes for `localStorage`), tested in
   isolation in `safeHistory.test.js`.

### What did NOT carry across, and why nothing needed to be dropped

Everything did. The R3F process-photo scatter field — flagged ahead of time as the
part most likely to need cutting — renders correctly once bug 3 above is fixed:
confirmed with a forced `prefers-reduced-motion: no-preference` context (the default
headless profile reports reduced-motion, which correctly serves the CSS masonry
fallback instead — also correct, also checked). The "Open works" panel's nested
iframe correctly reaches the REAL, unsandboxed `/wcc/artist-works-land/index.html` —
the landing was never changed to point at the snapshot copy of that page; that
reference is independent of whether this session's second project exists at all.

### One thing to know before opening it on the actual local install today

The two rows and their `codeFiles` are live on the local tier's data right now. The
THREE bugs above are fixed on this branch, not on whatever build the local install is
currently running — none of them are data bugs, they are bugs in code that RENDERS
the data (`codeFilesBundle.js`, the snapshot builder, `serverXR`'s CORS allowlist,
`LandingPage.jsx`). Opening `/wcc/p/landing-page-snapshot` on the install as it stands
right now reproduces bug 1 exactly (blank page, raw bundle text, console
`SyntaxError`) — screenshotted for the record before ruling it out as "this session's
fault" rather than "the install hasn't picked up the fix yet." Confirmed the reverse
is also true: served the SAME data (a copy, never the owner's live data) from a
throwaway `serverXR` built from this branch — `PORT=5242`, `DATA_ROOT=<copy>`,
`CLIENT_DIR=dist` — and every symptom above disappeared.

### Verified

Headless Chromium via Playwright, `--use-angle=swiftshader --enable-unsafe-swiftshader`
(WebGL needs real software rendering in headless, not just a browser that launches —
`scripts/verify-capture.mjs` already carries the same flags for the same reason),
1440×900 @ DPR 2, against the throwaway server above:

- `/wcc/projects` lists both new rows as "Page" among the thirteen things in the space.
- The landing opens to the real hero, unchanged from `/wcc`.
- "Read about" opens the About panel — real prose, the process gallery (checked
  BOTH as the reduced-motion CSS masonry and, forcing `no-preference`, as the R3F
  WebGL scatter field), the sponsor logos.
- "Open works" opens the real `/wcc/artist-works-land/index.html` in its nested
  iframe, scrolled through several artist entries.
- `artists-works-page-snapshot` opens standalone, scrolled through the same artists,
  its own snapshot mark linking back to the live iframe URL.
- `/wcc` itself: unchanged.
- Zero console/page errors across the entire flow once all three fixes were in place.

### Files

| file | why |
| --- | --- |
| `scripts/wcc-page-snapshot.mjs` | the builder; `package.json` gained `wcc:page-snapshot` |
| `src/wccSite/landing/snapshotEntry.jsx` | the standalone entry the builder compiles |
| `src/wccSite/landing/safeHistory.js` + `.test.js` | swallow the opaque-origin history SecurityError |
| `src/wccSite/landing/LandingPage.jsx` | uses `safeHistoryCall` for pushState/replaceState/back |
| `src/utils/codeFilesBundle.js` + `.test.js` | replacer-function fix for the `$`-sequence corruption |
| `serverXR/src/index.js` | `wcc` joins `CODE_PAGE_READABLE` |
| `src/codePageCors.test.js` + `serverXR/src/httpContracts.test.js` | guards for the CORS fix |
