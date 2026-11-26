## 2026-11-26 — code pages read the light desk's live status through the host bridge

- `PresentationCanvas` now answers `di-code-page-read` messages from its code-page iframe with an allowlisted (`/light/api/summary`, `/light/api/state`), read-only, rate-limited (4/s) GET; logic in `src/components/codePageReadBridge.js` with unit tests. No CORS added to the desk, no `allow-same-origin`.
