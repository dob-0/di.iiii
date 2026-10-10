## 2026-10-09 — saving a space's meta updates the row in place, no cascade

- Audit 2026-10-09 data F5 (fix H3): `saveSpaceMeta` used `INSERT OR REPLACE INTO spaces`. With foreign keys on,
  REPLACE deleted the row and the cascade took the space's projects, op logs, shelves, links, invites and domains.
  A slug held by another space was also a conflict, so REPLACE deleted that other space.
- Now an UPSERT (`ON CONFLICT(id) DO UPDATE SET`, sqlite.org/lang_upsert.html). `created_at`, `archived_at` and
  `position` are kept on an existing row; a slug clash fails with a UNIQUE error.
- Guard: `serverXR/src/spaceStore.metaUpsert.test.js`, 3 of 4 cases seen failing on the old statement.
- Checked: every other `INSERT OR REPLACE` in serverXR (`migrations`, `space_chat_lines`, `space_chat_pins`)
  targets a table nothing references; the foreign-key parents are only `spaces`, `projects`, `ai_chats`.
- Still owed: `POST /api/spaces` checks "exists?" then saves without a lock, so two creates of one name both
  succeed and the second updates the first one's meta (owner included). It should refuse the second with 409.
