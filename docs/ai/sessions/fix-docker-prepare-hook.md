## 2026-09-29 — dev deploys build again: the client image copies the hook installer before npm ci

- Three dev deploys failed because `npm ci`'s `prepare` named a script the image did not hold yet; the Dockerfile now copies it first. Guard `scripts/dockerfile-install.test.js` (red on the old Dockerfile).
