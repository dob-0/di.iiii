## 2026-08-23 — the jam was on no backup path; snapshots now carry project documents

- The Open Space snapshot only ever wrote `scene.json`. Everything people made in the
  communal jam — photos, text, placed objects — lives in the `open-jam` PROJECT
  document, so the daily snapshot backed up the room and not the work in it. Any guest
  holds `role: editor` there, which made one accidental mass-delete unrecoverable.
- A snapshot file is now a v2 envelope: `{ snapshotVersion, takenAt, scene, projects }`,
  written to the same directory under the same timestamped name, one file per snapshot,
  so the `keep` rotation and its retention math are untouched. Files written before this
  are bare scene objects and still read back as scene-only snapshots — prod's existing
  snapshots stay restorable.
- Documents are read raw from disk, never through `readProjectDocument`: that one
  normalizes and can write the normalized form back, and a backup path must not write to
  the thing it is backing up.
- Restore is symmetric. `restoreSpaceProjectDocuments` recreates a project row the vandal
  deleted, writes the document, appends a `replaceDocument` reset op and bumps
  `documentVersion` — the same shape as `PUT /api/projects/:id/document` — and
  `POST /api/spaces/:id/restore-snapshot` emits each one on its project SSE channel so an
  editor still holding the wiped copy resyncs instead of believing it is current. The
  response now reports `projects: [{ id, version }]` alongside the scene deltas.
- Assets stay out of snapshots, deliberately, and the comment saying why is still there:
  they are content-addressed files, copying them per snapshot would multiply the heaviest
  bytes on disk by `keep`, and restored JSON names the same ids. Growth is written down at
  the call site — ~30 KB per document, several per space, ~1 MB across `keep=7`.
- Guard: four cases in `serverXR/src/spaceStore.test.js`, watched failing against the
  unfixed store (`snapshot.projects` undefined, `restoreSpaceProjectDocuments is not a
  function`) and passing after.

### Not done, deliberately

- Idle account sandboxes that hold projects are still skipped by
  `archiveIdleAccountSandboxes` rather than folded into a snapshot. The snapshot could
  now carry them, but deciding to fold somebody's real work down to a backup is an
  owner's call, not a TTL sweep's — the comment there was corrected, the behaviour was
  not changed.
- The sandbox revive path (`ensureOwnSandbox`) still restores only the scene, which is
  correct today because the only snapshots it reads come from that project-free archive
  path. If the point above is ever changed, this one has to change with it.
- Nothing was verified against staging or prod — offline work against code and tests
  only, and no live API was called. The restore endpoint's new `projects` field has not
  been exercised against a real browser session.
