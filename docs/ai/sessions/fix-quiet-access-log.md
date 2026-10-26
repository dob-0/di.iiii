## 2026-10-26 — the request log keeps only answers that went wrong

- The owner's whole-machine check of aylmo (N1307) found the journal reaching back six days: di-server wrote ~1,750 request lines a minute, 98 % of them OK answers to the follow engine's own polling, and the 4 GB cap rotated older boots away.
- morgan now skips answers below 400 (`serverXR/src/accessLog.js`, the method morgan's README gives); `DI_ACCESS_LOG=all` brings every line back. Tests run the real morgan.
- Still owed (separate rows): the follow engine's idle load on aylmo (~17 % of one core, from polling its own server) and its repeated "could not be carried" warnings for files neither machine has.
