## 2026-10-05 — Raw: raise the moved card, rename opens at the end

Seen on the owner's screen: a card dropped on another sank back under it; N then one key left the label "o".
- Fix: `.is-selected` z 10 (below `.is-held` 20); `TitleField` puts the caret at the end instead of select-all.
- Proof, `scripts/verify-raw-raise-rename.mjs`, Playwright mouse/keyboard, 1440x900, DPR 1.25, `di-dev up raw-followup --api scratch`:
  origin/dev 2 FAILED (A1 topmost at overlap n-pricing; B1 field "o"); with the fix all 5 checks pass (A1 n-night; B1 "Baro"; B2, B3, A2 pass).
- `npx vitest run src/raw`: 84 files, 951 tests passed.
- Limits: one scratch project, four cards; selection z-index also lifts a selected card over later cards when nothing was moved (intended).
- The scratch stack needed di-atlas PR #43 (own session secret); the script uses the auth-disabled scratch session, no sign-in.
