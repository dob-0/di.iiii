## 2026-09-27 — the project list ends clear of the account button

- Reproduced on a local stack (LIVE_API_URL set read-only, no token) at 390x844 DPR3 with 8 projects: at the
  end of the scroll the fixed account button sat on the live-sync row (button 728–758, row 741–820).
- The button's place is now three tokens in base.css, read by the button and by the list's end padding.
  After: the row rests at 637–716, 12px clear. Desktop unaffected. Guard: accountButtonClearance.test.js.
- Not changed: `src/raw/utils/windowLayout.js` still reasons with the literal 86px/30px in a comment and its
  own maths — worth pointing at the tokens next time that file is touched.
