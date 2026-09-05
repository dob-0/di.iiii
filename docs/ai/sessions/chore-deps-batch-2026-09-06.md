## 2026-09-06 — six dependency bumps land together after the camp freeze

- Six dependabot PRs frozen since the Dilijan camp week (freeze ended Aug 31) each go
  stale as the next lands, so they land as one branch instead of six races: pdfjs-dist
  6.2.108→6.3.289 (root), @vitejs/plugin-react 6.0.5→6.1.1 (root, dev), multer 2.2.0→2.3.0
  (serverXR), sharp 0.35.3→0.35.4 (serverXR), morgan 1.11.0→1.12.0 (serverXR),
  softprops/action-gh-release 3.0.2→3.0.3 (release.yml, pinned SHA).
- Checked `docs/ai/dependency-decisions.md` first — none of the six appear on the parked
  list (drei, react-router-dom, eslint 10, MUI 9, node-alpine 26). All six were clear to
  take.
- pdfjs-dist 6.3 carries three `api-minor` return-shape changes (getJSActions,
  getFieldObjects, markInfo now return Maps instead of plain objects). The only caller
  in this repo, `src/studio/utils/assetFormats.js`'s `pdfToImageFiles`, uses only
  `getDocument`/`getPage`/`getViewport`/`render` — none of the changed APIs — so the
  bump is a no-op for this codebase's usage.
- multer and morgan both carry security fixes (multer: 4 CVEs; morgan: CVE-2026-15603,
  token-value escaping in log output) — real reasons to take them, not just routine.
- No unit test exercises `pdfToImageFiles` itself (canvas rendering path); the existing
  `assetFormats.test.js` only covers placement-whitelist logic, not the PDF render path.
  A visual check of PDF-to-image import in Studio is still owed before calling this
  surface verified — the guards below only prove it builds and lints clean.
- Guards run in the worktree: lint (0 errors, 64 pre-existing warnings), build, full
  vitest suite (368 files / 3542 tests), server-contracts (7 files / 115 tests),
  `check-agent-docs.mjs`.
