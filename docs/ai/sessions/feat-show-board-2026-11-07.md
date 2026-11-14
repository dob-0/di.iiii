## 2026-11-12 — scripts/show/board/ledger_board.py: the work board of a show, from its config

- The owner asked for one page to track a concert's work across chats ("what we do, what is what, what left"); the lead chat on
  aylmo wrote it as `~/work/platina/board/build.py` and owed landing it here. A studio-mac chat (dob-05) had built a second
  board from `board.py`; the owner said "make them one", then picked "finish the board the way the lead wrote it".
- `ledger_board.py` + `ledger_page.html` are that builder with every show name moved into `board.json` (title, show time,
  ledger, reports, chats, areas, pull requests, branch filter). `facts.md` gives the first section. `board.py` is untouched.
- Tested: `python3 -m unittest scripts/show/board/test_ledger_board.py` (3 tests); on aylmo the old builder and this script,
  same sources, same minute: both print `rows 191 … unsafe 20/22`, pages differ in 2 lines (the footer naming its source).
- Not done: the lead chat still runs its own `build.py` (the show folder is not a repository); switching it is the lead's
  step after this merges. No watch mode (the lead rebuilds and publishes by hand). Not seen in a browser from this tree
  beyond a headless screenshot of the same page built by `build.py`.
