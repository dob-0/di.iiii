## 2026-09-28 — three small things from the debug list, and the deploy page told the truth

Walked on a test stack, phone 390x844 DPR3 + desktop 1440x900 DPR2 (Help reached the way a person does: the palette —
double-tap on a phone, `/` on a keyboard — then "help").
- Raw Help ended in an empty bordered 33px strip on every screen: `<footer className="raw-help-footer" />` outlived its
  contents. Removed with its three CSS rules and its phone block. Guard in `RawHelpDialog.test.jsx`, red on the old dialog.
- The new-project ✕ was 24x21 on a phone. `.sh-btn-cancel`, `.sh-rename-save/-cancel`, `.ssh-btn-cancel` take
  `--di-touch-target` (44px) under `(pointer: coarse)`; measured 44x44 after, mouse sizes unchanged. Guard
  `src/studio/styles/hubTouch.test.js`, red on the old CSS.
- "Wordmark overlapping the empty Raw canvas": not reproducible — the empty canvas now shows the first-node card only. Stale.
- `docs/deploy/LIVE_DEPLOY.md` named `di-studio.xyz` for everything and described only the SSH deploy. `DEPLOY_TARGET`
  is `mac` since 2026-09-27 (the host pulls a green run itself); the page now says so, names `diiii.xyz`, and keeps
  `di-studio.xyz` as the sign-in callback name. `legacy/` and the cPanel pages were left as the records they are.
