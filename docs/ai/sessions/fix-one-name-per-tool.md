## 2026-09-23 — one name per tool, and the front page ends in one link

- `/tools` and the local home call the node canvas **Nodes**, the word the surface bar already
  used. Keys, routes and folders stay `raw`. Projection's Carry panel says "Projection as text",
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
