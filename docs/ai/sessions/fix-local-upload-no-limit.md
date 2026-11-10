# fix/local-upload-no-limit (2026-11-10)

- Meant: a personal install has no upload size wall (owner: "this is a pro tool"); hosted tiers keep 100 MB.
- Condition: `DI_LOCAL === '1'` and `MAX_UPLOAD_MB` unset/blank. `di up` sets it (scripts/di/runner-node.mjs); docker-compose.yml, serverXR/Dockerfile, scripts/write-server-env.mjs and the cPanel script never do (write-server-env also writes MAX_UPLOAD_MB=100 explicitly). NODE_ENV cannot be the signal: `di up` also sets production.
- Changed: serverXR/src/config.js (resolveMaxUploadBytes), serverXR/src/index.js (requestTimeout 0 when unlimited; 413 body has maxBytes), tests in config.test.js and projectContracts.test.js, known-fixes.
- Other limits: express.json 10 MB (JSON only, not files); nginx.conf client_max_body_size 110m (hosted stack, not local; left); Node requestTimeout 300 s (fixed for unlimited); proxy_read_timeout 60s hosted only.
- Left: the VJ deck 413 text ("the limit is 100 MB") exists only on feat/perform-full; it should read the 413's maxBytes, else say the server refused it for size. CLI `openToTooLarge` is about a REMOTE host's cap and stays true.
- Undo: set MAX_UPLOAD_MB=100 in the install's env, or revert the commit.
