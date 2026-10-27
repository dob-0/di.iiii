# fix/structure-edit-once

## An edit that adds a line goes in once, and its re-run is a no-op (N1330)

- 2026-10-26 (owner: "ok so now eveytying pushed from this and we synced with dev ?"): putting the di.iiii space's
  page text on dev (9 edits) left the dry run saying "1 × tools-room" after `--apply`. The page was right; the edit
  keeps the label (`from`) inside its `to` and adds a line, so the label matched again and a second run would add
  the line twice.
- Fix: `editHtml` skips the places that already read `to` when `to` holds `from` (`scripts/space/pages-lib.mjs`).
- Test: combine-pages.test.mjs N1330 case (red on the old code, green now); scripts/space 56 passed.
- Checked live with the fixed dry run: dev and the own di say 0 to do; the tools room has the label once and the
  added line once on both.
