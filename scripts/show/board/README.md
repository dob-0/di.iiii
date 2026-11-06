# scripts/show/board — the show board (global view)

One page for a show night: the picture (`board.md`) plus one live lane file per chat (`lanes/<chat>.md`), rendered to
`global-view.html` in the di.iiii frame, refreshing itself every 20 s. Born 2026-11-07 for the hosq x ReA opening at Cinema House
(owner: "make the global view of rea … the other agents to works there … check them, help and manage them").

- `board.py --watch` re-renders on change and every 30 s; run it as a user service: `systemd-run --user --unit show-board python3 scripts/show/board/board.py --watch`; stop: `systemctl --user stop show-board`.
- Show it: `di-show ~/di-health/rea/global-view.html` (one di browser over the agent's chat).
- Lane file keys: job, state (running | blocked | waiting-owner | done | idle), now, last, next, needs-owner, claim, windows, risks, cost, session.
- The marks at the start of a board line draw as badges: `!!` needs you · `??` question · `++` done · `..` running · `->` idea · `==` summary · `--` limit.
- Colours are the owner's legend; frame is di.iiii (black, square corners). Tokens sit in one `:root` block in `board.py`.
