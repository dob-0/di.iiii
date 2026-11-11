# scripts/show/board — the show board (global view)

One page for a show night: the picture (`board.md`) plus one live lane file per chat (`lanes/<chat>.md`), rendered to
`global-view.html` in the di.iiii frame, refreshing itself every 20 s. Born 2026-11-07 for the hosq x ReA opening at Cinema House
(owner: "make the global view of rea … the other agents to works there … check them, help and manage them").

- `board.py --watch` re-renders on change and every 30 s; run it as a user service: `systemd-run --user --unit show-board python3 scripts/show/board/board.py --watch`; stop: `systemctl --user stop show-board`.
- Show it: `di-show ~/di-health/rea/global-view.html` (one di browser over the agent's chat).
- Lane file keys: job, state (running | blocked | waiting-owner | done | idle), now, last, next, needs-owner, claim, windows, risks, cost, session.
- The marks at the start of a board line draw as badges: `!!` needs you · `??` question · `++` done · `..` running · `->` idea · `==` summary · `--` limit.
- Colours are the owner's legend; frame is di.iiii (black, square corners). Tokens sit in one `:root` block in `board.py`.

## ledger_board.py — the work board of a show (2026-11-12)

`board.py` above shows a show NIGHT from lane files only. `ledger_board.py` shows the WORK before a show: every owner
request of the show's chats from the owner ledger, sorted into areas (problem · try it · working · not started · done),
one card per chat (its lane or its handover's last update, its branches), "is the work safe" (branches not on GitHub)
and the show's pull requests with their checks.

- Run: `python3 -I scripts/show/board/ledger_board.py --config ~/work/<show>/board/board.json --out ~/work/<show>/board/board.html`
  (needs the ledger file, `git`, and `gh` for the pull-request cards; stderr prints `rows N tally {...} unsafe a/b`).
- The show's data sits next to its config, never in this folder: `board.json` (copy `board.example.json`), `lanes/<chat>.md`
  with lines `NOW:` / `NEXT:` / `NEEDS OWNER:` / `RISK:`, and an optional `facts.md` (`## card title`, then `- line`).
- Page: `ledger_page.html` (light and dark, phone width). Test: `python3 -m unittest scripts/show/board/test_ledger_board.py`.
- First show: a concert on 2026-11-14, written by its lead chat as `build.py` in the show folder; this script draws the same
  page from the same sources (compared on aylmo 2026-11-12: 2 differing lines, the footer naming its source).
