# cPanel Prebuilt Deploy

This release is prepared for cPanel deployments where the frontend is prebuilt in GitHub Actions and the backend runs as a cPanel Node.js App.

## Contents

- `public_html/`
  Prebuilt frontend assets to sync into the web root.

- `serverXR/`
  Backend application files for the cPanel Node.js App.

- `shared/`
  Shared schema/runtime files used by the backend.

- `release.json`
  Build metadata for this staged release.

## Deploy shape

- Web root serves the frontend
- `/serverXR` is owned by the cPanel Node.js App
- Do not deploy a public proxy folder for `/serverXR`
- Generate `serverXR/.env` from environment-specific secrets before restarting the Node app
