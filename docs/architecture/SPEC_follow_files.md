# Spec — Follow carries files ("asset chase")

Status: **built + tested on loopback; not yet run between two real machines.**
Owner: Backend/API + Security. Relates to: `serverXR/src/follow/` (`di follow`),
[SPEC_space_sync_keys.md](SPEC_space_sync_keys.md), `serverXR/src/blobStore.js`.

## 1. The problem

`di follow` keeps one space alive on two installs by carrying **op logs** both ways.
A project's asset manifest travels with them (`upsertAsset` / `deleteAsset` are document ops),
and each asset is named by the **sha256 of its bytes** with a mount-relative url
(`/api/projects/<pid>/assets/<sha256>`). The bytes never crossed. On the other machine that url
resolves to *its own* server and 404s — a video placed on the calling machine was a dead frame
on the stage machine.

## 2. What travels now

| | carried |
|---|---|
| Room (scene) ops, project ops | yes — unchanged |
| **Files named by a project document**, sha256 ids | **yes — this spec**, both directions |
| Files with legacy (uuid-shaped) ids | **no** — counted and reported as `notCarried` |
| Files placed in the **space scene itself** | **no** — see §6 |

## 3. How (`serverXR/src/follow/assets.js`)

For every file a project names, ask both machines `GET …/assets/:id/meta`. Where exactly one
holds it: `GET` the bytes from that one into a temp file (hashing as they stream), **check
sha256 === id**, then `PUT` them to the other (§4). Both held → nothing to do. Neither held and
the document no longer names it → dropped silently; still named → reported.

- **What it looks at:** once per project, both machines' documents (files named before the
  follow began); after that, the `upsertAsset` / `deleteAsset` ops the op loop reads anyway.
- **Never blocks ops.** The op loop only *notes* ids and kicks the chase; the chase is its own
  non-overlapping task. Edits keep crossing while a 2 GB video is in flight
  (`followIntegration.test.js` holds a download shut and proves it).
- **Bounded.** One file at a time; disk-to-disk through `httpClient.js`
  (`httpDownloadToFile` / `httpUploadFile`, node:http — never global fetch); size cap =
  this install's `MAX_UPLOAD_MB`; temp files rest in the uploads dir (same disk as the blob
  store, never a tmpfs) and are always removed.
- **Retry.** Per file: 2 s, 10 s, 30 s, then it is listed as failed and looked at again every
  5 minutes. Answers that will not change (401/403/413/415/422, over the cap) fail at once and
  are not retried. A stubborn file goes to the back of the line.
- **Stops with the follow** (`stop()` aborts the transfer in flight).
- **Leftovers.** A process killed mid-transfer leaves `*.verbatim` / `follow-*.part` in the uploads
  dir. Swept once at server start: only those two names, only that directory, only older than
  one hour (`sweepStaleTempFiles`, `serverXR/src/verbatimAsset.js`).

## 4. The hash-pinned store route

`PUT /api/projects/:projectId/assets/:assetId?name=&mimeType=[&width=&height=]`, raw bytes as
the body (`application/octet-stream`), streamed to a temp file and hashed on the way
(`serverXR/src/verbatimAsset.js`) — never buffered.

| | |
|---|---|
| `:assetId` not a 64-hex sha256 | `400` |
| caller not allowed (§5) | `403` |
| mime/extension not on the upload allow-list | `415` |
| larger than `MAX_UPLOAD_MB` | `413` |
| **bytes do not hash to `:assetId`** | **`422`, temp file deleted, nothing stored** |
| already present (reference + blob) | `200 { already: true }`, nothing rewritten |
| stored | `200 { already: false, asset }` |

On proof it writes the blob to `spaces/<space>/blobs/<sha256>` and the project's
`assets/<sha256>.json` reference exactly as the upload route does. It emits **no op** — the
`upsertAsset` naming the file has already travelled.

**Why not re-upload through `POST …/assets`?** That route runs `scrubImageMetadata`, which
re-encodes images to strip EXIF/GPS, so the stored bytes hash to a *different* id than the one
already written into the ops on both machines (`scripts/tier-sync.mjs` documents this and remaps
ids; a follower cannot remap — the id is already in both logs).

**Why skipping the scrubber is safe on proof.** A file only gets a sha256 address on a di.iiii
by passing through the upload route, which scrubbed it *before* hashing. Bytes that hash to that
address are therefore byte-for-byte the already-scrubbed file.

## 5. Who may call it

Proof alone is not enough: anyone can hash an un-scrubbed photo and PUT it under its true
sha256. So the route is for **replication only** (`mayStoreVerbatim`, `serverXR/src/index.js`):

- a **per-space sync key** (`type: 'sync-key'`; editor on that one space — role and space scope
  are enforced by the same `requireWriteRole('editor')` gate as the upload route;
  a key for space A on a project in space B is 403 with nothing left on disk — pinned by
  `projectContracts.test.js`), or
- this server's **internal API token** (the follower writing to its own install; matched on the
  bearer header itself, because a `di up --guests` loopback request is promoted to the local
  owner before tokens are read), or
- an install with **auth off** (a local machine — every caller is already the owner).

An ordinary signed-in editor, or any other API token, gets **403** even though the upload route
would accept their file.

Residual trust, stated: a sync-key holder can push a file their *own* install never scrubbed
(e.g. written into its blob store by hand). That is the trust a space owner extends by minting
the key — the same key already writes ops to the space.

## 6. What is NOT carried

- **Space-scene assets.** No scene op carries an asset manifest, so the other machine never
  learns the file exists. Out of scope here; `di follow` says so when a follow is made.
- **Legacy uuid-shaped ids.** Nothing to verify against. Counted as `notCarried`; re-adding the
  file gives it a sha256 id and it travels.
- **Whole-work ops** (`replaceDocument` …) are refused by a follow already; files they name are
  not chased.

## 7. Reporting

`GET /api/follows` → each follow gains
`files: { carried, pending, failed, failures: [{ id, name, why }], notCarried, bytesPending }`.
`di follows` prints, under the follow: `3 files still coming (250 MB)` ·
`1 file could not be carried — opening.mp4: the other di.iiii refused the key` ·
`2 older files are not carried — …`. Nothing is printed when there is nothing to say.

## 8. Compatibility

An older host has no PUT route: a 404/405 on the PUT that is not our own "Project not found."
is **final** — not retried — and `di follows` says `the other di.iiii is older and cannot receive
files — update it`. Files from the host still arrive. (Our route's own project-404 IS retried:
the project is made on the next pass of the op loop.) An older follower
simply does not chase. An older CLI ignores `files`.
