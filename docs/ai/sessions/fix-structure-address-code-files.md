# fix/structure-address-code-files

## apply-structure moves a space's address inside multi-file pages too (N1290)

- 2026-10-26 whole check, area 1: di-iiii/di-landing linked /main (the space's old id). Its HTML lives in
  presentationState.codeFiles (index.html), which the address step never read (codeHtml only).
- Fix: the address step also moves links in every .html/.htm code file; other files are left as they are.
- Test: apply-structure.test.mjs "the address in a page made of several files" (HTML moved, JS untouched, saved as edits,
  re-run sends nothing); scripts/space 54 passed.
- Live, 2026-10-26 02:2x: applied on the own di (backup ~/work/agent-reports-2026-10-26/main-address-backup.json):
  "1 link(s) in code files /main -> /di-iiii"; dev had it 20 s later through the follow (out 1, still following) —
  the first live proof of #1131 (tool saves as edits are carried).
