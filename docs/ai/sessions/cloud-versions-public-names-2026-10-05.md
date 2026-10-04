## 2026-10-05 — the version row for a visitor: the server shows the public parts of the list

Branch `cloud/versions-public-names-2026-10-05` (from origin/dev). Cloud agent, no browser: nothing here was looked at on
dev.diiii.xyz or on a phone; run `npm run verify:surfaces -- --base https://dev.diiii.xyz` on `/moxir` after it lands.

- **Problem (measured 2026-10-05):** the list project `<production>-versions` is private, so a visitor's read answered 404 and
  the row fell back to `rigVariant.siblings` — concepts on the row, no "for the show", "Old versions (8)".
- **Decision (owner):** the server shows visitors only the public parts; the list project stays private.
- **Route:** `GET /api/spaces/:spaceId/productions/:production/versions` answers `{spaceId, production, versions:[{id, projectId, title, status}]}`,
  ordered as the list orders them; a version whose project the caller may not see is left out; never madeBy, fingerprint, note, rig.
  404 where there is no list, 400 on a malformed production id; a private space answers as every other read of it. Catalogue entry added.
- **Row:** `RigVersionSwitch` reads the route, then the private list project, then siblings.
- **Tests (fail on origin/dev, pass now):** `httpContracts.test.js` (visitor, member, private version project, no leaks),
  `RigVersionSwitch.list.test.jsx` (row with the route answering).
- **Not done:** no wiki entry (no new words a person reads); a version whose project is a draft still appears in the route (the row
  already intersects with `/contents`, which drops drafts).
