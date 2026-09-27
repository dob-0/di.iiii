## 2026-09-27 — the front door links to /support

- `/support` (space `support`, live on prod with Whydonate + Polar) had no way in. One word, "Support",
  in the landing nav after GitHub, and once in the footer — the nav row is `display:none` under 640px,
  so the footer is the phone's way to it. Nothing on published works: the owner chose "spaces max
  minimalistic", so `MadeWithBadge` is untouched.
- Guard: `LandingPage.test.jsx` "LandingPage support link" — exactly two links, both `/support`,
  one nav + one footer.
- Seen in Firefox on this branch: 1440×900 @2x (nav + footer) and 390×844 @3x (footer); clicking
  either link opens the support page.
