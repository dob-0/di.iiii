## Light desk: names for unnamed controls (UX audit F129, slice S59)
- Replaces: nothing. Attributes only (aria-label, tabindex, role) on 9 kinds of control; no look or behaviour removed, so nothing needs a mode/tool/archive.
- Files: serverXR/src/lighting/ui/index.html, deskNames.test.js, wiki 'lighting-desk', known-fixes.
- Tests: deskNames.test.js 2 passed; fails on old html (2 failed). lighting.test.js 14 passed.
- Not tested: axe in a browser, keyboard walk on a scratch desk (desktop/phone); routes test needs serverXR npm ci.
