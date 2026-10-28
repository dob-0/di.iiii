## show-checkpoint: first real save and restore (scratch serverXR)

- Ran save then restore against a scratch serverXR (`di-dev up ckpt --api scratch --require-auth`): save wrote 9 files + a private copy project; restore put the saved document back (4 entities, equal except `updatedAt`).
- Found: `--restore` without `--token-file` sent the default `~/.di/di.env` token to the manifest's api and failed with a bare `HTTP 404`. The error now names the api and says to pass `--token-file`; RESTORE.md shows the flag. Test added.
- Not a bug: the scratch stack serves the `/light/api/*` desk routes (empty state), so no desk failures were recorded; the failure path stays covered by the fake-client test.
