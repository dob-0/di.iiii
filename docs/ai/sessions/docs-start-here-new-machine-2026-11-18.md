## 2026-11-18 — one page for a new machine: docs/START-HERE.md

- Ask (owner): one easy method anyone can remember, from a bare PC in a terminal to working on di.iiii.
- Walked on r-di (Raspberry Pi, Debian 13, Node 24): door 1 (`curl … | sh`, `di up --port 4171`, `di new`, `di save`), door 2 (`git clone` 87 s, `npm ci` 159 s, `npm run start-check` ok).
- Found: port 4000 was taken by another program, `di up` then says "already running" and `di new` answers Unauthorized → the page says use `--port`.
- Not walked: `npm run dev`, lint, tests, a real push, macOS, Windows. Marked on the page.
- Changed: `docs/START-HERE.md` (new), `docs/start-here.html` (same page as a UI, brand colours), `README.md` (one link). r-di restored: test install, clone and files removed.
