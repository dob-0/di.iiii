## 2026-09-15 — Facade wave 2: one name per space on cards, list rows, headings and tabs

- Applied the owner's 2026-09-14 rule in di.iiii's own furniture: a space's label is the one
  name a visitor sees for it; a project's title shows only where the URL names the project.
- /spaces grid: the card header no longer prints the space id above the name (the map already
  dropped it); a visitor's card has no project line at all; an owner's card says
  "Opens on: …" only when the door's title differs from the space's name. Pure rule in
  `src/studio/utils/spaceNames.js` (names compared by their letters and digits, so
  `br_id_ge` = `br-id-ge`).
- /spaces list: name once, no id under it; "what opens" follows the same rule and says
  "the space itself" otherwise.
- `PublicProjectViewer`: `viewerTitle` (room heading for readers and crawlers, walk-mode header,
  page frame's accessible name) is the space's name on a space's own door, the project's title
  only on `/{space}/p/{project}`. Seen headless: /dilijan walk header "Dilijan · ԱՇԽԱՐՀՆԵՐ",
  /network heading "The network", /br-id-ge/p/landing still "the landing — the door".
- `SpaceContentsPage` now names its tab `{space} — di.iiii` (was the site default).
- Rule written into docs/ai/vocabulary.md ("One name per space"); wiki article
  `spaces-map-view` updated.
- Verified against dev's real data through a local GET-only proxy (every POST and websocket
  refused, nothing written to any tier); before shots from dev itself.
- NOT done, owner's call (data, listed in the PR body): `main` labelled "di.iiii", wcc's door
  titled "Main", "Open Space" vs "Open Jam", `br_id_ge` spelling, the look-*/front-room QA
  scenes and "i dont know"/"mini" in /open, codenames printed inside the network page.
- Still open in code: algovrithm (a code work) shows "nothing published / no door" in the list
  and counts under "Needs a door" although it opens; the WCC landing's own heading
  "WCC: Women Creating Change" is the work's content and was left alone.
