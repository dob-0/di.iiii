## 2026-10-07 — a proposal file can no longer plant bytes under another file's content address

Bug sweep 2026-10-07, lane Q1 (security and privacy review), session dob-c9.

**What was wrong.** A `.diiii` file sent to an existing space (a proposal, `POST /api/spaces/:spaceId/proposals`)
is applied with `copyIfMissing` into the space's content-addressed stores: `blobs/`, each project's `assets/`, and
the space's `assets/`. A file there is named by the sha256 of its bytes, and nothing ever replaces a file that is
already there. `readBundle` checked only that each name *looked* like an asset id. So a file whose bytes were not its
name would stand in for the real file for every project that names that hash later, including a later upload of the
real bytes, which the upload route de-duplicates onto what is already there. Every other way in already checked
(the project upload route refuses a client-named sha256 that does not match; the follow carry hashes before it
offers a file and the verbatim PUT is hash-pinned).

**Who could do it.** Someone whose proposal is applied to a space: the owner, an admin, or a sandbox's owner
directly; any other editor of the space (in the communal Open Space, every signed-in session) after the owner
presses Apply. The approver saw "+N new files" and had no way to tell.

**What changed.** `readBundle` hashes every sha256-named file in `blobs/`, `projects/*/assets/` and `space/assets/`
and refuses the whole file (400, "A file inside does not match its name…") on the first mismatch. Legacy uuid ids
name no hash and are read as before. One file: `serverXR/src/contentProposals.js`.

**Measured.** `serverXR/src/contentProposals.blobHash.test.js`: on the old code the three refusal cases failed
(`readBundle` returned the planted files) and the control passed (1 of 4); with the fix 4 of 4 pass. The neighbouring
`serverXR/src/proposalContracts.test.js` (real bundles exported by `scripts/space-bundle.mjs`) still passes 4 of 4.

**Not done (owed).**
- Hashing costs one read of every file in a proposal before anything is written. Not measured on a large bundle.
- Not checked: whether `POST /api/spaces/bundle` ("open a file", which creates a new space) and
  `scripts/space-bundle.mjs import` verify names against bytes. A new space only harms its own importer, so it is lower,
  but it is the same class.
- Not seen on a real surface: no server or browser was started (machine rules for this sweep).
