## 2026-10-26 — the request log keeps only answers that went wrong

- The owner's whole-machine check of aylmo (N1307) found the journal reaching back six days: di-server wrote ~1,750 request lines a minute, 98 % of them OK answers to the follow engine's own polling, and the 4 GB cap rotated older boots away.
- morgan now skips answers below 400 (`serverXR/src/accessLog.js`, the method morgan's README gives); `DI_ACCESS_LOG=all` brings every line back. Tests run the real morgan.
- Still owed (separate rows): the follow engine's idle load on aylmo (~17 % of one core, from polling its own server) and its repeated "could not be carried" warnings for files neither machine has.
- After two reviews: a request the client gave up on keeps its line (no answer sent, though statusCode reads 200); morgan moved ahead of express.json so 400/413 body errors get a line; `DI_ACCESS_LOG=1` works like the other DI_* switches. The follow engine's 404 probes for asset metas neither machine has (~32k lines a day on aylmo, two moxir projects) stay as their own owed row.
