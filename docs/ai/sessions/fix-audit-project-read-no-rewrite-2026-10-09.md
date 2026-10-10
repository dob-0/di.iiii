## 2026-10-09 — opening a project never writes its document; unknown fields survive a save

- Audit 2026-10-09 (06-data-integrity F3, H2 in the fix list): `readProjectDocument` — behind GET
  `/api/projects/:id/document`, the space listing and the place routes — normalised `document.json` and wrote it
  back with no project lock whenever the result differed. Reproduced first: `serverXR/src/projectRead.test.js`
  failed 3/3 on dev (file rewritten; `timelineState` and an entity's `futureField` gone; 9 of 300 read-vs-save
  tries lost a committed edit).
- Now a read normalises in memory only; the normalised form reaches disk with a save, under
  `withProjectWriteLock`. `normalizeProjectDocument` / `normalizeEntity` in both schema twins carry top-level
  sections and entity fields this build does not know (`passUnknownFields`; known keys win, `__proto__` never
  carried). After: 0 of 300 lost, bytes and mtime unchanged by a GET, unknown section and field survive GET + save.
- The guest-sandbox promote (index.js) leaned on the read's write-back to repoint `projectMeta.spaceId`; it now
  checks the file and rewrites it under the write lock. The keep-the-room contract test checks the moved file
  (fails without this change).
- Two older tests asserted the old behaviour (the read persisting a self-heal / a spaceId repair); they now assert
  the answer is healed at once and the file on the next save.
- Still owed (audit F3 fix list): a document-format version in `document.json` that refuses, by name, to rewrite a
  newer format; a follow handshake comparing builds; unknown keys inside `projectMeta`, `showState`,
  `performState`, `mappingState`, `windowLayout`, nodes, assets and templates are still dropped (measured).
  `jsonStore.readJson` still repairs a corrupt file on read (with a `.bak`), unlocked — a separate path.
