# Self-Hosting a Space

Move a space — scene, projects, assets, op history — out of one di.iiii install
and run it on your own machine with one command. No running source server is
needed to import; the bundle is the space.

This is the first step of the MANIFESTO's "heritage collection" direction: a
space you can hand someone as a file and still open in 30 years.

## The bundle

A space bundle is a `tar.gz` containing everything a space is made of:

```
bundle.json                       manifest (format, version, spaceId, counts)
space/meta.json                   spaces DB row
space/scene.json                  V1 scene
space/ops.jsonl                   scene op-log
space/assets/                     space-level assets (binaries + .json sidecars)
projects/<pid>/meta.json          projects DB row
projects/<pid>/document.json      project document
projects/<pid>/ops.jsonl          project op-log
projects/<pid>/assets/            CAS refs (<sha256>.json) + legacy binaries
blobs/<sha256>                    content-addressed asset bytes (stored once)
commons.json                      commons index rows shared from this space (if any)
```

Deliberately **not** in a bundle: `space_sync_keys` and `space_links` (they
carry secrets and host-specific GitHub bindings), and user accounts — the
original `owner_user_id` references a user of the source install, so imports
drop it unless you pass `--owner`.

## Export (on the source install)

```bash
npm run space:export -- <spaceId>                      # → <spaceId>.space-bundle.tar.gz
npm run space:export -- <spaceId> --out my-space.tar.gz
```

Reads the data root directly (`--data-root`, default `serverXR/data` or
`$DATA_ROOT`) — works with the server stopped.

## One-command self-host (on the target machine)

```bash
git clone https://github.com/dob-0/di.iiii.git && cd di.iiii
npm run selfhost -- my-space.tar.gz
```

`selfhost` installs dependencies if missing, creates `serverXR/.env` with
local defaults (auth off), imports the bundle, starts the dev stack, and
prints your space URL (`http://localhost:5173/<spaceId>`). Run it with no
bundle to self-host a blank install.

## Import into an existing install

```bash
npm run space:import -- my-space.tar.gz                 # keep original id
npm run space:import -- my-space.tar.gz --as new-id     # import under a new id
npm run space:import -- my-space.tar.gz --force         # overwrite existing space
npm run space:import -- my-space.tar.gz --owner <userId>
```

Rules the importer enforces:

- Refuses to overwrite an existing space id without `--force`.
- Refuses project-id collisions with *other* spaces (project ids are global) —
  import into a fresh data root if you hit this.
- `--as` rewrites embedded `/api/spaces/<oldId>/` asset URLs in scene and
  project documents so media keeps resolving.
- A source space of `kind=global` imports as `kind=normal`; make it global via
  /admin on the target if that's what you want.
- Recreates project `<hash>.json` refs, so `scripts/gc-space-blobs.mjs` will
  not reap imported blobs.

## Verification

Round-trip fidelity (meta, documents, CAS bytes, legacy asset bytes, `--force`
guard, `--as` remap) is covered by `serverXR/src/bundleContracts.test.js`,
part of `npm run test:server-contracts`.
