## 2026-10-07 — the shoot sheet: /shoot/{key}, a film crew's shared plan through one link

- Asked by Emily for a film shoot two days out: put the planner she had as a single HTML file online in di.iiii so the
  crew can tick props, write under them ("it's in the van") and add things, from a shared link. The shoot itself (its
  client, people, date and photos) is deliberately not named anywhere in this repo.
- **Route** `/shoot/{key}` (`APP_PAGE_SHOOT`, reserved in `spaceRouting.js` and `shared/reservedSegments.cjs`; checked
  first that `/serverXR/api/spaces/shoot` and `/resolve/shoot` 404 on diiii.xyz and dev.diiii.xyz). Lazy page
  `src/pages/shoot/ShootPage.jsx` (a plain page like /for-apps, so it lives under src/pages), its own scroll container (base.css pins the body).
- **Server** `serverXR/src/routes/shootRoutes.js`, registered before the `/api` auth gates like `/api/track`:
  `GET /api/shoot/:key` (`?rev=` answers `{unchanged:true}` for pollers), `POST …/ops` (item.set / item.add /
  item.remove / cast.set / text.set, serialized per sheet with `createKeyedLock`), `PUT …/plan` (the seed),
  `GET|PUT …/files/:name` (webp/jpg/png ≤ 5 MB, flat lowercase names). Stored as JSON + files under
  `DATA_ROOT/shoot/<sha256(key)>/`. Own rate limiters (reads 1500, edits 600, photos 120 per 10 min per IP).
- **Who can write:** the key in the path is the only credential (132 random bits). A sheet exists only when
  `sha256(key)` is in `SHOOT_KEY_HASHES` in the route file or the `SHOOT_KEY_HASHES` env var, so the endpoint can't be
  used as anonymous storage. Wrong key and missing sheet answer the same 404. Links are stored only as http(s).
- **Nothing private in the repo:** the plan (names, client, date) and the photos are written onto the server with
  `scripts/shoot-sheet-push.mjs --base … --dir … --key-file …`. Once a sheet exists the script uploads photos only
  unless `--replace-plan` is given, because writing the plan replaces the crew's ticks.
- Live-ish: each open page polls every 4 s while visible and applies its own edits optimistically
  (`applyLocally` mirrors `applyShootOps`). Verified with two browsers on a local stack: a tick + note on one showed on
  the other in ~3 s, an added prop crossed the other way; desktop 1440 and phone 390 screenshots looked at.
- Wiki: new entry `shoot-sheet`. Tests: `serverXR/src/routes/shootRoutes.test.js` (ops, link cleaning, mounted routes,
  concurrent edits, file names), `src/pages/shoot/shoot.test.js` (routing, picture matching, call-time order).
- Not done: no realtime push (polling only); no per-sheet admin or revoke other than removing the hash; photos can be
  replaced by anyone with the link (by design, same trust as ticking).
