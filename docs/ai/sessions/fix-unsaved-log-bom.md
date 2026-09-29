## 2026-09-29 — the daily watch's log reads right in Windows PowerShell

- First Windows run of #641 on ponyo (Emily ran install.ps1; task result 1 = findings, as designed):
  the log is UTF-8 without a BOM, so Windows PowerShell 5.1's `Get-Content` shows every "—" as "â€”".
- `unsaved.mjs` writes a UTF-8 BOM when it CREATES the log on win32 (`logPreamble`); other platforms and
  existing logs are unchanged. Test: `unsaved-lib.test.js` "the watch log on Windows".
- An existing BOM-less log on Windows keeps its old lines mis-shown; deleting it once lets the next run
  create it with the BOM.
