# feat/assets-reid-2026-10-05

## What and why

Owner, 2026-10-05: "yes, re-add them." `di follow` reports "older files are not carried" for files whose
id is not the sha256 of their bytes (`isCarriableId`, `serverXR/src/follow/assets.js`; message
`followFileLines`, `scripts/di/ui.mjs`; `docs/architecture/SPEC_follow_files.md`). On the owner's local
install: 386 in space `open`, 78 in space `main`.

`scripts/assets-reid.mjs` (new; no existing tool fits: `copy-version.mjs` makes a new project, this
repairs one in place) re-adds them: download the bytes, upload through the normal route (content
addressed; images are re-encoded by the privacy scrub, so the id returned is used), rewrite every
reference with ops, read back, then drop the old entry. The old bytes stay in the store.

## Method

- Ops only (`upsertAsset`, `updateComponent`, `updateEntity`, `updateNode`, `updateEdge`, `set*State`,
  `upsertPerformPreset`, `setMappingSurface/Cue/State`, `setProjectMeta`, `deleteAsset`); never a
  whole-document PUT, which follow does not carry. Written at the re-read version; 409 re-reads and re-plans.
- Refuses a project (nothing uploaded, nothing written) when an old id is an object key, sits in
  `windowLayout` / `workspaceState` / `templates`, sits inside an entity, node or edge id, or is a short
  id inside free text.
- Undo record written before the first write (default `~/di-backups/assets-reid/`); `--undo <file>`.
- Dry run on the owner's local install 2026-10-05: `open` 386 older files in 5 projects, 386 references,
  0 refused; `main` 78 older files in 1 project, 78 references, 0 refused. Every old id is named once.

## Owed

- Not run for real anywhere. Run order: `--dry-run`, then one project (`--project`), then the space;
  then `di follows` should show 0 older files.
- Limits: files over `--max-bytes` (200 MB default) are left as they are and reported; the tool holds a
  file in memory while it crosses.
- Follow carries `deleteAsset` only as far as PR #746's limits allow; check the dev side after a run.
