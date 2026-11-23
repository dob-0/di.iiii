# 2026-10-29 — Languages in the address (ledger N1490, N1155)

## Context

The owner, 2026-10-21 (N1155): *"i think better to have one global button for aramenian we need to concepts and
sketchs about that"*. Three sketches followed (`docs/design/lang-switch/`). On 2026-10-29 (N1490) he answered **yes** to
*"Languages: B, so Armenian gets its own address (/hy/…) and Google finds it?"*, with Russian too (plan question Q2, A).
The north star: simple for a child of 9 and a man of 74, and a real tool for professionals.

Where we start (dev at 21928a9b4): no `src/i18n` and no i18n package; `<html lang="en">` is fixed (`src/index.html:2`),
every head says `og:locale en_US` (`serverXR/src/routes/ogRoutes.js:50`), and the router has no basename
(`src/RootApp.jsx:1031`). Measured 2026-10-29: `https://diiii.xyz/hy` answers 200 with the same 8,058 B shell as an
unknown address (a soft 404); `https://dev.diiii.xyz/serverXR/page/terms` answers 503 (17 B); prod runs 14b90b33d069,
whose `ogRoutes.js` has no `injectHead`, so prod writes no head of its own per address yet.

## Decision

1. English keeps every address it has today. Armenian is `/hy` + the same path; Russian is `/ru` + the same path.
2. One language table, `shared/i18n/languages.cjs`, mirrored in `src/i18n/languages.js` with a drift test, drives the
   router, the server head, the reserved words, the switch, the sitemap and robots.txt.
3. The prefix is split once: on the client by React Router's `basename`, read at boot; on the server inside `resolveHead`,
   before the space is read. Path builders stay as they are; full page loads and history writes use `withLang()`.
4. A language address may be indexed only when its body is platform text, every string on it was checked by a native
   speaker, and the server wrote its hreflang cluster. Every other language address opens for people (200) and carries
   `noindex`, no canonical and no hreflang.
5. The switch is plain links beside the di.iiii mark: `EN · ՀԱՅ · РУС`, the current one filled.
6. Machine drafts show only on preview hosts (`dev.*`, `*.localhost`), marked. On public hosts a draft shows English.

## Options considered and why not

- **Sketches A and C** (2026-10-21): not chosen; he picked B, where the address carries the language (N1490).
- **Canonical to English on a `/hy/` page with no Armenian** (sketch B as drawn). Google does not recommend noindex for
  choosing a canonical inside one site, but these pages must stay out of Search: the spam policy names "automated
  transformations like synonymizing, translating" and says "If you're hosting such content on your site, exclude it from
  Search"; with noindex Google will "drop that page entirely from Google Search results".
- **Design angle A** (drafts shown publicly; the spaces list counted as platform text): drafts would reach strangers, and
  the cards on `/spaces` are authors' words. Its safer parts are kept: the client noindex lock, headers on the installed
  di, the history-write guard and the staleness hash.
- **The prefix in nginx**: the installed di has no nginx; serverXR answers both through one `renderPage`
  (`serverXR/src/index.js:3435-3439`).
- **The prefix in the shared base-path seam**: the same `getBasePrefix()` builds API and desk URLs (lightingLink, ndiLink,
  oscBridgeClient, dmxRigClient); they would become `/hy/light/api`.
- **Basename and prefixing builders together**: `/hy/hy/…`, because `navigate()` already adds the basename.
- **Redirects by browser language, IP or cookie**: Google: "Avoid automatically redirecting users from one language
  version of a site to a different language version of a site"; Googlebot sends no `Accept-Language`.
- **Messages under root `shared/`**: the client never imports root `shared/` (Vite root is `src/`, `vite.config.js:501`).
  Messages stay in `src/i18n/messages/`; the server reads generated copies.
- **Precompiled messages** (`@formatjs/cli`): not in v1. If they come later, an AST round-trip test comes with them.

## What it replaces and where the old stays

- Every English address, head, sitemap entry and printed QR code stays; a snapshot test pins the English heads.
- `/hy/…`, `/ru/…` and `/en/…` were empty shells; `/en/…` now answers 301 to the bare address. No space or project can be
  named `hy`, `ru` or `en` (3+ characters, `serverXR/src/spaceStore.js:23`); the codes are reserved anyway.
- `/make` keeps Armenian first with English under it (`src/make/makeVocabulary.js`), as its own mode outside the switch.
- The works (`src/wccSite`, `src/algoVrithm`), `/chat`, the `/light` desk and spaces on their own domain keep one bare
  address; `/hy/<them>` answers 302 to it. Nothing in a work or in a project's own design is touched.
- The base-path strip keeps working; only its missing segment check is fixed (`laneBasePath.js:15` and
  `spaceRouting.js:162` use `startsWith`, so under base `/hy` the address `/hyper/studio` became `per/studio`).
- The static shell stays the fallback (nginx `@shell`). The vendored 3D Armenian font stays; its missing OFL text is added.

## Addresses and what search engines see

| Address | People see | Search sees |
|---|---|---|
| `/x` | as today | as today; hreflang only once `/hy/x` or `/ru/x` is indexable |
| `/hy/x`, covered | Armenian frame and body | `lang=hy`, self canonical, hreflang en/hy/ru + x-default (English) both ways, `og:locale hy_AM` + alternates, checked title, sitemap entry |
| `/hy/x`, not covered | Armenian frame; platform pages add 'Այս էջը դեռ հայերեն չունի։ Ստորև՝ անգլերեն։' | `noindex` (meta and header), no canonical, no hreflang, no sitemap entry |
| `/hy/<language-free>`, or a language not offered on this host | — | 302 to the bare address |
| `/en`, `/en/x` | — | 301 to the bare address |

- Covered = the body is platform text (front door, terms, privacy, for-apps, wiki) and every id on the page is checked
  and fresh. `/spaces`, Studio and every space and project are never covered: their authors wrote them.
- Google reads the visible text: "We don't use any code-level language information such as lang attributes, or the URL."
  So the gate is checked text, not the address.
- hreflang: "Each language version must list itself as well as all other language versions"; "If two pages don't both
  point to each other, the tags will be ignored"; alternates "must be fully-qualified". Head only, because using several
  methods gives "no benefit in Search"; the sitemap only adds a plain `<loc>` per covered version.
- The installed di answers the same: `renderPage` returns status, headers and location, and `servePage` applies them
  (today it sends only status and html).
- While the page route is down, two locks hold. The client adds `<meta name="robots" content="noindex">` at boot to any
  language address without a server-written cluster ("You can use JavaScript to add a robots meta tag"); it only adds,
  never removes. nginx `@shell` sends `X-Robots-Tag: noindex` for `/hy` and `/ru`, keyed on `$request_uri` ("full original
  request URI"), because `$uri` "may change during request processing" and `@shell` runs `try_files` (`nginx.conf:475`).
  The shell's canonical script (`src/index.html:81-87`) writes none on a language address.
- robots.txt gets `Disallow` twins for `/hy/admin`, `/ru/admin`, `/hy/preferences` and `/ru/preferences`; `/hy` itself is
  never disallowed, because a noindex page "must not be blocked by a robots.txt file".
- Preview hosts: `dev.*` (already `noindex, nofollow`, `nginx.conf:35-39`) and `*.localhost`.

## The switch

- Part of the di.iiii frame, beside the mark, never inside More; Priority+ reserves its width first.
- Labels as the sketch draws them, each in its own script, the same at every width: `EN · ՀԱՅ · РУС`. The current one is
  filled, `aria-current`, not a link. The others are plain links to the same path in that language, query and hash kept,
  each with `lang`, `hreflang` and its full name (English, Հայերեն, Русский) as its accessible name; 44×44 px or more.
- It lists the languages offered on this host where the path has a language form (on which pages: owner question 1). It is
  not drawn with one entry, on chat, works, the light desk or own-domain hosts.
- Mounted on every SurfaceBar, on the landing header outside `{!entered && …}` (`LandingPage.jsx:411`, so it stays after
  "Step inside"), and on the four legal headers (`TermsPage.jsx:27`, `PrivacyPage.jsx:33`, `ForAppsPage.jsx:37`,
  `DeviceLoginPage.jsx:654`). S28's one top bar takes the same component.
- One press from any page with the frame (S13's proof target T11 is at most 2).
- Remembered by the cookie `di_lang`, as the sketch draws it: set on a press, read only by the client and only at `/`, to
  draw one line ('Հայերեն →'). Never a redirect; the server never reads it. EU guidance exempts only session-length
  language cookies; a longer life needs "additional information in a prominent location (e.g. 'uses cookies' written next
  to the flag)" (WP194 §3.6). Its life is owner question 2. Signed in, S20 keeps the choice on the account.

## Text, fonts and their sources

- `react-intl` 12.1.4, exact (BSD-3-Clause, 2026-10-05; it pins `intl-messageformat` 12.1.3, `@formatjs/intl` 6.1.3
  and the parser 3.5.21; `npm view`, this run). `intl-messageformat` 12.1.3 is pinned too, for plain JS later (S53).
- Messages: `src/i18n/messages/<namespace>/<lang>.json`, one namespace per surface. English rows hold text and a note for
  translators. Armenian and Russian rows hold text, status (`draft` or `checked`), source (`machine:<model>@<date>` or
  `human:<name>@<date>`), who checked it and when, and the sha256 of the English they translate. When the English changes,
  the test fails until the row is drafted again.
- `scripts/i18n/build.mjs` writes `shared/i18n/coverage.json` and `shared/i18n/head.json` for the server (serverXR
  already requires root `shared/` at run time, `serverXR/src/ndi/names.js:11`); a stale copy fails the test.
- Counts use ICU plurals: in Armenian 0 and 1 are both "one"; Russian has one, few, many and other.
- Words first: Armenian and Russian for space, project, scene, object, place and production go into
  `docs/ai/vocabulary.md`, marked unverified until checked.
- The owner checks on one review page (`scripts/i18n/review.mjs`, opened with di-show) and says OK or the fix per line;
  the agent records it. He never edits a file.
- Fonts: today's `public/fonts` files hold 0 Armenian and 0 Cyrillic letters (fc-query, this run). Added and self-hosted
  for offline venues, from Fontsource 5.3.0 (OFL-1.1, published 2026-07-19): Noto Sans Armenian, armenian subset,
  26,812 B; Inter cyrillic 18,748 B and cyrillic-ext 25,960 B; JetBrains Mono cyrillic 12,108 B and cyrillic-ext 2,028 B
  (jsdelivr, this run). Each face has a `unicode-range`, so English pages fetch nothing new; each file has a versioned
  name (`/fonts` is cached as immutable), its OFL text and a README row (source, version, sha256, date, fc-query counts).
- Nothing is copied from a work. In `src/wccSite/landing/fonts/` the file named `…-armenian.woff2` holds no Armenian
  letters and `…-latin.woff2` holds them (fc-query, this run): reported to the owner, not touched.

## Tests

Each fails on today's code:
- `/hyper/studio`, `/ruby`, `/ru-ok` and `/HY/x` are not language addresses; the old helpers keep `/hyper/studio` under `/hy`;
- `hy`, `ru` and `en` are reserved, the same on server and client; robots.txt has the twins; every work id is language-free;
- `resolveHead('/hy/terms')` is found and noindex (today: space "hy", 404); a checked fixture gives the cluster both ways;
  `/en/terms` 301 and `/hy/wcc` 302, also through the installed di; English heads byte-identical;
- `/hy/spaces` renders the spaces surface (today: space "hy"); `appNavigate` never gives `/hy/hy/`; a wiki article keeps
  `/hy/wiki/<id>`; the boot lock marks only language addresses; all 14 history writes in 9 files are on a reviewed list;
- every English id has Armenian and Russian rows; a stale row fails; drafts show English on public hosts; plurals;
- the new font files count above 0 in fc-query; every new face has a `unicode-range`; each sha256 equals the README;
- nothing in serverXR, `shared/` or nginx reads `Accept-Language` or `di_lang`.

## Proof

- Every PR: English pages pixel-identical before and after, 1440×900 and 390×844, dark (di.iiii has one theme).
- `/spaces`, a space, the Studio hub and `/terms` in en, hy and ru on a test copy; heads by curl from a scratch serverXR.
- `/make` and a space with Armenian and Russian text before and after the fonts; no new font on English `/spaces`.
- After the gate: `dev.diiii.xyz/serverXR/page/terms` answers 200 (503 today) and an unknown address 404 (200 today).
- The owner on his phone at `https://dev.diiii.xyz/hy/spaces`; a phone cannot reach his own `diiii.localhost`.

## PR order

S13a gate (page route on the Mac) · S13b language table · S13c core words · S13d fonts (after S05) · S13e server head ·
S13f the app under `/hy/` and `/ru/` · S13g message layer · S13h the switch (after S05, S07) · S13i remember the choice ·
S13j titles (after S19) · S13k Armenian public (after the gate and his check). S13a, S13b and S13c start together. Where
S08 and S15 touch the same files, rebase; S18 and S13g both change the lock: the second regenerates it with `npm install`.

## What the owner checks

The six core words; the Armenian frame (9 bar words, 3 badge words, ՀԱՅ and Հայերեն, the notice line, the draft mark);
Noto Sans Armenian beside Inter and in the bar; the switch on his phone; later the front door (S36) and the sign-in and
legal text (S51) before they go to Google. Russian: the same set, by a native speaker he names.

## Limits

- Google sees nothing until the page route runs on prod: S13a and the dev to main promotion are owed rows.
- Nothing becomes indexable in S13; page bodies come with S36 and S51.
- Chat stays at `/chat`, the scope of its service worker and app.
- Spaces on their own domain get no prefix in v1; the artist's consent comes first.
- An Armenian-written space is indexed only at its bare address until a space can state its own language (owed row).
- Links that load a full page are converted slice by slice (S13f does the frame, the public pages and the 34 builder
  links); until a surface is done, a click there may land on English.
- Unchecked: SITE_ORIGIN on prod (S13k reads it first); private space ids under 3 characters (S13b counts them);
  react-intl's bundle bytes (S13g measures them).
