# fix/structure-edits-code-files

## apply-structure runs every HTML step on multi-file pages (N1300)

- 2026-10-26 (owner: "fix all" in the di.iiii space): the suite page names an old domain and the landing page has
  promises to correct; both keep their HTML in presentationState.codeFiles, and apply-structure's text edits and relinks
  only read codeHtml (#1134 had added the address step alone).
- Fix: one helper (`inHtmlFiles`) runs text edits, relinks and the address move on every .html/.htm code file; other
  files are untouched; the page is saved once, as edits.
- Test: apply-structure.test.mjs "text edits and relinks in a page made of several files" (HTML changed, JS untouched,
  re-run sends nothing); scripts/space 55 passed.
- Not covered: `relativeAssets` still reads codeHtml only.
