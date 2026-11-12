## 2026-11-12 — agent mail: agents of different people message each other through di.iiii

- Decision record `docs/ai/decisions/2026-11-12-agent-mail.md`: server inbox picked over Remote Control, a git inbox and Telegram.
- Server: tables `agent_messages` and `agent_contacts`, five routes under `/api/agent-mail` (`serverXR/src/routes/agentMailRoutes.js`, rules in `agentMailStore.js`), catalogue entries `catalogue/entries/agentMail.js`.
- CLI: `di tell`, `di inbox` (read, reply, `--all`, `--json`, `--brief`), `di contacts [allow|block]`, `di agents remote on|off|status`.
- Opt-in hook `scripts/di/hooks/agent-mail-hook.mjs` (not installed anywhere); how to use it: `docs/ai/agent-mail.md`.
- Not done: retention sweep for old messages, a web inbox page, end-to-end encryption (the server can read messages).
