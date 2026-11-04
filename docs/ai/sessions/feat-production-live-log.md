## 2026-11-04 — a project page follows its group chat by itself (live-log)

- Owner ask (ledger N2121): real-time tracking of the ReA project on its dev page.
- `scripts/production/live-log.mjs` reads every message di.bo saved for one Telegram group, keeps the newest save of each, and writes one section ("The group, live", PRIVATE) into the project's code page between `<!--live:start-->`/`<!--live:end-->`, with photo and video thumbnails; it writes through the API with the stored login only when the section changed. `--dry-run --out`, `--remove`.
- `scripts/production/live-log-timer.sh install|remove|status <project> <chat> [tier]`: a systemd user timer, every 2 min; `--dry-run` for di-ask.
- First real use: cinema-house/what-we-have on dev, group -1004449920523 (95 messages, 12 pictures); backup of the page before: `~/di-backups/live-log/what-we-have-dev-before-2026-11-04.json`.
- Tests: `scripts/production/live-log.test.js` (dedupe of edits, escaping and day order, splice/replace/remove round trip).
