## S13b — the language table (UX plan, languages design 2026-10-29, ledger N1490)

- One table: `shared/i18n/languages.cjs` (server) and `src/i18n/languages.js` (client mirror): en (bare), hy (Հայերեն, ՀԱՅ, hy_AM), ru (Русский, РУС, ru_RU); hy and ru `public:false`.
- Helpers on both sides: `splitLang` (a whole lower-case first segment only), `withLang`, `isLanguageFree` (works, chat, light, ai, static directories, paths with a file extension), `isPreviewHost` (`dev.*`, `*.localhost`).
- `shared/i18n/langPath.cases.json` is the one case table; `src/i18n/languages.test.js` runs it through both copies and fails if their data drift.
- `en`, `hy`, `ru` reserved from the table (`shared/reservedSegments.cjs`, `RESERVED_APP_SEGMENTS`); robots.txt twins for `/hy|ru/admin|preferences`.
- Fix: `createBasePathHelpers` and `stripAppBasePath` own whole segments only (base `/hy` no longer turns `/hyper/studio` into `per/studio`). `getBasePrefix` unchanged.
- `scripts/i18n/count-short-ids.mjs`: read-only count of space/project ids under 3 characters (guest view) on prod, dev and aylmo.
- Nothing is wired to a page yet: no visible change. Next: S13c (core words), S13e (server head), S13f (router basename).

What the change replaces, and where the old stays (nothing is lost): the `startsWith` base-path strip is replaced by a whole-segment strip — the old behaviour was a bug (`/hyper/studio` → `per/studio`) for any base path, and every real base path (`/app`, `/hy`) still strips exactly as before for `/app`, `/app/x`. `/hy/…`, `/ru/…`, `/en/…` were empty shells that fell through to the space lookup; they are now reserved words (no space can be named so: ids are 3+ characters, `spaceStore.js:23`). No English address changes.
