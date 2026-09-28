# feat/rig-equipment-media — verified codes, the makers' photos and papers on the item cards (2026-09-28)

Stacked on `feat/rig-equipment` (#624). Owner: "we need to also real images of each device …
you check all eq from list right ? and also find the documentation's and attach it"; on
copyright: "yes look to keep copyrights just links also ok if there hard with that".

- **Data**: `src/rigbuild/items/media.json` — per item a verification (confirmed / probable /
  equivalent / unknown, evidence URL + date, the stand-in) and media entries (photo, manual,
  dmx-chart, datasheet, safety) with maker, URL, page, `offer` (`download` kept / `link` only),
  sha256, size, date and the local asset id. Metadata only. Rules: `mediaRules.js`; tests
  `media.test.js`.
- **Script**: `scripts/rigbuild/fetch-equipment-media.mjs` (`--record` first fetch, default verify,
  `--upload` to the local install's space). Refuses in-repo caches and non-local hosts; a sha256
  change is not stored. Tests `fetch-equipment-media.test.js`.
- **Card**: badge + evidence, gallery (kept maker's photo → our render "3D model" → Commons),
  "maker's photos" links, DOCUMENTS. `Inventory.jsx`, `equipment.css`. Wiki entry updated.
- **Research**: three agents (lights / fx / control), each photo looked at before recording.
  Result: 6 confirmed (incl. UP-COB200, new), 22 equivalent, 2 unknown. 24 files kept and stored
  on the owner's install (space `moxir`), 54 links. No UPlight manual/DMX chart exists online;
  stand-ins' charts recorded by page but NOT applied to the UPlight types (would drive real units
  wrong). MDG ATMe chart p.17 agrees with the OFL profile in use.
- **Where the bytes are**: cache `~/.local/share/di.iiii/equipment-media/<item>/<sha256>.pdf`;
  the install's `spaces/moxir/assets/` (backup before: `~/di-backups/moxir-before-media-2026-09-28/`).
  To undo the store: delete those 24 assets (`DELETE /api/spaces/moxir/assets/<id>`, ids in
  media.json) or restore the backup.
- Method + verification table: RIG_BUILD.md §13.8.
- Owed: UPlight's charts (drafted requests, not sent: `~/Downloads/rig-equipment/permission-request.md`),
  the real products behind 22 codes, ETC Sensor3 + LumiNode full manuals (truncated ×3), a real phone.
