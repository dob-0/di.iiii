## 2026-09-23 — one name per tool, and the front page ends in one link

- `/tools` and the local home call the node canvas **Nodes**, the word the surface bar already
  used. Keys, routes and folders stay `raw`. The local home's desk link says **Light**, as
  `/tools` and the bar do (it said "Lights"). Projection's Carry panel says "Projection as text",
  "Paste a projection" and "Replace this projection" instead of mapping.
- The landing's Help & Wiki block keeps its eyebrow, title, one line and the "Open the Wiki →"
  button; the 18-card highlight grid is gone (with its CSS). `LandingPage.test.jsx` turns red if
  a grid comes back (checked: 19 links with the old grid).
- `copyVocabulary.test.js` now also reads `src/tools/ToolsRoom.jsx` and
  `src/landing/LocalHome.jsx`; "Raw" as a name in either fails it (checked by putting it back).
  `docs/ai/vocabulary.md` gains the Nodes and Light rows and a 2026-09-23 amendment.
- Not done, on purpose: Studio's "Lights" button and the placed lamp keep the word Light until
  the owner settles decision 4. `WIKI_HIGHLIGHT_IDS` / `WIKI_HIGHLIGHTS` stay exported because
  `docs:wiki:check`, `wiki-sync.test.js` and `WikiPage.test.jsx` still read them; nothing renders
  them now, and retiring them with those checks is its own small change.
- Seen in a browser (Playwright, 1440×900 DPR 2 and 390×844 DPR 3, own stack on 4340/5340 with a
  throwaway data root): local `/tools` reads Studio · Nodes · Light · Projection · Desk, hosted
  `/tools` reads Studio · Nodes · Projection; the local home's doors read Tools · Studio · Nodes ·
  Wiki and its desk line says Light; `/?tour=1`'s Help & Wiki block has one link and no grid, and
  it opens `/wiki`; the Carry panel reads "Paste a projection" / "Projection as text". No console
  errors, no sideways scroll.
- Worth knowing: the landing does not literally END at the Wiki block — "API & agents", "What you
  get" and the footer still follow it. The grid is gone; the order of sections is landing copy and
  waits on the owner with the rest of the story.
