## 2026-11-12 — the dev tier takes a 2 GB space file (fix/dev-upload-limit)

- Meant: dev.diiii.xyz accepts an 843 MB space file from `di open FILE --to` (owner row N3847). Production unchanged at 100 MB.
- Changed: docker-compose.dev.yml (MAX_UPLOAD_MB 2048), nginx.conf (bundle/proposals location), serverXR/src/index.js (requestTimeout 0 above 100 MB), scripts/uploadLimit.test.js, known-fixes.
- Note: branch fix/local-upload-no-limit (unmerged) also touches index.js requestTimeout; both lines are compatible, a merge conflict there is trivial.
- Risk: dev server mem_limit 384m; multer streams to disk, but the import spawns scripts/space-bundle.mjs in the same container; its memory on an 843 MB file is unmeasured.
- Undo: revert the commit, or set DEV_MAX_UPLOAD_MB=100 in the dev .env.
