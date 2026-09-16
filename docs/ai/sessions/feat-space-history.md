## 2026-09-16 — the safety net: every change has an author and a way back

Part B of the plan "Two lines, one safe way in" (B1, B2, B3, B5 and the server half of B4).
Section A (start-check, CONTRIBUTING, write-script checks) is a separate branch.

- **Authors (B1).** `space_ops` and `project_ops` gain `actor`, `actor_type`, `actor_label`
  (`db.js`, `ensureColumn`). Stamped server-side from `req.authState` via
  `serverXR/src/opActor.js` on POST ops (space + project), PUT scene, PUT document,
  inscriptions, restore, bundle import (rows the tool wrote are stamped with the importer).
  Server-made changes are `server:<reason>` (`server:undo`, `server:daily`,
  `server:sandbox-archive`). The actor lives in columns, never inside the op JSON, so
  `GET /ops` is unchanged; a client-sent `actor` never gets past `normalizeIncomingOps`.
  **SCHEMA_VERSION was NOT bumped**, deliberately: the rule written on `SCHEMA_VERSION` says
  bump only when an older build would misread the data, and three nullable columns are
  invisible to it. A bump would make every older `di` refuse the database and every
  `.diiii` bundle written by this build (space-bundle compares schemaVersion). Owner can
  overrule — it is a one-line change.
- **Restore points (B2).** `spaceStore.takeRestorePoint(spaceId, {reason, actor})` replaces the
  open-space-only snapshot (`snapshotSpaceScene` stays as a wrapper returning the path).
  Envelope v2 gains `id`, `reason`, `actor` and per-project asset manifests
  (`assets/<sha>.json`), restored when the blob is still present — otherwise an undone
  image delete would 404. Taken: before PUT scene / PUT document / sync pull / restore /
  bundle import onto an existing id, and before the first change of each **burst**
  (`serverXR/src/spaceHistory.js`: a burst ends when the author changes or pauses longer
  than `CONTENT_BURST_GAP_MS`, default 15 min; rebuilt from the op log after a restart).
  Retention: newest 30 + newest per UTC day for 30 days; explicit `keep` (idle sandbox
  archive) stays a count. Open Space keeps its daily point (`reason: daily`).
  `scripts/gc-space-blobs.mjs` now keeps every blob a kept snapshot mentions
  (`--snapshots-dir`, default `<data root>/snapshots`), tested.
- **API (B3).** `GET /api/spaces/:id/snapshots`, `POST /api/spaces/:id/restore-snapshot
  {snapshotId?}` (default latest; takes a `before-restore` point first; returns
  `restorePoint`), `GET /api/spaces/:id/changes?since=<ms|ISO>` — all owner-or-admin.
  `spaceHistory.summarizeChanges` is the shared helper (counts added/removed/changed,
  kinds, assets, title changes, whole replaces, projects touched, one plain `text`).
- **Studio (B5).** Spaces → card → Manage → **History**: rows "when / before X's change" with
  Restore + confirm, built from the existing `ssh-project-linker` / `ssh-linker-*` classes.
  Wiki entry `space-history`.
- **Live check** on a copy of the local tier (own ports 4610/5610): two accounts edited
  `wcc`, History showed both, Restore removed Emilya's objects and kept the owner's.

### Notice contract for the bot task (B4, di-bo side still to build)

Off unless `CONTENT_CHANGE_NOTICES_ENABLED=true` AND `APPROVAL_BOT_URL` + `APPROVAL_SHARED_SECRET`.
Sent once per burst, when the burst closes (gap elapsed, or another person starts), only
when the author is not the owner (no owner → not an admin), never for `sandbox`/`global`
spaces or server actors. Failures are logged, never block a write. Timers are in memory:
a restart drops a notice for a burst still open.

```
POST {APPROVAL_BOT_URL}/content-changed
X-DII-Timestamp: <ms>
X-DII-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>   // same as /approvals
{
  "kind": "content.changed",
  "id": "<24 hex, notice id>",
  "space":  { "id", "label", "slug"|null, "ownerUserId"|null },
  "actor":  { "subject", "type", "label" },
  "burst":  { "startedAt": ms, "endedAt": ms },
  "summary": { "text": "Emilya · WCC (scene, Page) · +3 images, 1 object removed, title changed",
               "counts": { added, removed, changed, addedKinds:{kind:n}, assetsAdded, assetsRemoved,
                           titleChanges, sceneReplaced, projectsReplaced, settings, ops },
               "scene": bool, "projects": [{ "id", "title" }] },
  "link": "<SITE_ORIGIN>/<slug|id>",
  "undo": { "snapshotId", "method": "POST", "path": "/api/content-changes/undo",
            "body": { "spaceId", "snapshotId" } } | null,
  "sentAt": ms
}
```

Undo (bot → di.iiii): `POST /serverXR/api/content-changes/undo` with `undo.body` plus optional
`decidedBy`, signed the same way (±5 min window, `verifyInboundSignature`). 200 → restore
result (`restorePoint` = the point taken before the undo, so Undo is undoable); 401 bad
signature; 404 notices off / space or snapshot gone. Recorded as `server:undo`.

### Not done

- di-bo side: `/content-changed` handler + Undo button under `BOT_ROLE=inner`, and the check
  that `approvalKb`/`handleApprovalNotify` are served there.
- No History in the admin Preferences → Manage surface (owners use the Spaces card; admins
  can too). Snapshots do not follow a space id rename (`moveSpace`).
