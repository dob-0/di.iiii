# kids

`cinema.project.json` is a snapshot of the **360 Cinema** project document
(`/kids/p/cinema`) — 8 CRT sets in a ring, each playing one of the camp's clips,
under a hanging lamp.

Unlike `scene.json` elsewhere in `spaces/`, this is a *project* document, not the
legacy per-space scene. Restore it with a PUT to
`/serverXR/api/projects/cinema/document` on a server that already has the project
row, or import a full bundle made with `npm run space:export -- kids`.

The eight video files are **not** here: binary assets are excluded from `spaces/`
by `spaces/.gitignore`, and the originals live in gitignored `serverXR/uploads/`.
The document's `assets[].url` entries point at them by id, so a restore onto a
server without those blobs gives you the room with dark screens. Use the bundle
export if you need the media too.
