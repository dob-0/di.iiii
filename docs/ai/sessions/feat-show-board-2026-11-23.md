## 2026-11-12 — scripts/show/board/ledger_board.py: the work board of a show, from its config

- The owner asked for one page to track a concert's work across chats ("what we do, what is what, what left"); the lead chat on
  main-desk wrote it as `~/work/platina/board/build.py` and owed landing it here. A studio-laptop chat (dob-05) had built a second
  board from `board.py`; the owner said "make them one", then picked "finish the board the way the lead wrote it".
- `ledger_board.py` + `ledger_page.html` are that builder with every show name moved into `board.json` (title, show time,
  ledger, reports, chats, areas, pull requests, branch filter). `facts.md` gives the first section. `board.py` is untouched.
- Tested: `python3 -m unittest scripts/show/board/test_ledger_board.py` (3 tests); on main-desk the old builder and this script,
  same sources, same minute: both print `rows 191 … unsafe 20/22`, pages differ in 2 lines (the footer naming its source).
- Not done: the lead chat still runs its own `build.py` (the show folder is not a repository); switching it is the lead's
  step after this merges. No watch mode (the lead rebuilds and publishes by hand). Not seen in a browser from this tree
  beyond a headless screenshot of the same page built by `build.py`.

## 2026-11-23 — rebuilt on dev (owner yes, N6316; replaces #1271)

- #1271 carried old history and two unrelated session notes (hotfix space scope, release dev to main); this branch is dev plus only the show-board files.
- ledger_board.py:161 nested same-quote f-string (a SyntaxError before Python 3.12) now uses double quotes inside.
- Tests: `python3 -m unittest test_ledger_board` → Ran 3 tests, OK. No Python job in CI runs them yet.
