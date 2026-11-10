## 2026-11-10 — public setup guides say which version has `di login`, and a join page

- Walked the install on a clean machine with the released di 0.4.3: `curl -fsSL https://diiii.xyz/get | sh`, `di --version`, `di up`, `di new`, `di save`, `di down` all work with no account. `di login` answers `no such command: login`; so does `di channel`, and `di update --channel dev` ends with "already the newest".
- `di login` first appears on dev in 2026-10-07 and is in no stable release (the newest, v0.4.3, is from 2026-09-07). The public guides sent every new reader to it. Now each line that says to run `di login` says it needs a di newer than 0.4.3, how to check (`di --version`), and what to do on 0.4.3.
- Changed: `docs/ai/public/setup.md`, `src/pages/AiSetupPage.jsx` (same words as setup.md), three wiki articles in `src/wiki/wikiContent.js` (terminal sign-in, network name, connect your assistant), `docs/deploy/DI_CLI.md`.
- New: `docs/ai/public/join.md` (served at `/ai/join.md`), linked from `setup.md` and `llms.txt`.
- Not done: Windows and macOS were not walked; the browser steps (open the address, sign in with an invite) were not walked. Once a stable release has `di login`, the version notes should be removed.
