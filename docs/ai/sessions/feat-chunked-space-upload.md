## 2026-11-12 - chunked, resumable upload of space files

- Why: Cloudflare in front of dev.diiii.xyz refuses bodies over ~100 MB; the owner's platina.diiii is 843 MB. Raising our limits cannot help, so the client splits the file.
- What: server routes `/api/space-uploads` (start / PUT part / finish / status / abandon) in `serverXR/src/chunkedUploads.js`; the two doors' handlers were extracted so finish runs exactly the plain POST's code (`bundleDoor`, `submitProposalFile`). Client `scripts/di/chunkedUpload.mjs` for `di open --to` and `space-proposal.mjs` above 90 MB. nginx part route allows 70m.
- Protocol: S3-multipart shape with tus-style resume status; documented in the module header, not tus-conformant.
- Not done: `scripts/space-bundle.mjs import` still leaves /tmp/space-bundle-* dirs (its `die()` calls process.exit inside the try, so the finally never runs; killed runs leak too) and needs ~2x the file size in temp disk (tar extraction next to the bundle). Not changed here.
- Not tested: a real 843 MB upload through Cloudflare (nobody uploaded to dev); the nginx config was not run (no nginx here), only guarded by a text test; sessions are in memory, so a server restart ends an upload and the client starts again.
