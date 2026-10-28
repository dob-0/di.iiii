## 2026-10-28 — A wrong link says it is wrong; empty and missing places say what to do (UX slice S07)

- UX audit slice S07 (findings F010, F070, F071, F142, F154), built from db7d9c667.
- `/<space>/<name-not-in-space>` now shows "There is no project called … in this space" with See what is in this space, Go to the front page, See spaces, Get help — only when the server answered 404. A failed question (401, network) and a build without a server still open the space as before; resolved slugs and moved-project forwards are unchanged.
- The unknown-space card says "We could not find …", has the three exits, and its di.iiii mark links to the front page. The P13 uniform card (missing = private) keeps its words and gains the same exits.
- One empty sentence for an empty space and its project list: "Nothing here yet. The owner has not shown anything.", with front page and spaces links.
- The crash page no longer says "Work saved, nothing changed"; the raw error sits under "Details for helpers".
- `/<space>/studio/director` with no director now goes to the space's Projects (replace). Bare `/scan` says where scanning lives.
- Wiki: "Spaces & projects" gains the paragraph on wrong addresses (updated 2026-10-28). known-fixes entry added.
- Not done here: before/after pictures on the agent screen at desktop and phone (owed by the proof step); the empty-space view keeps its dark inline colours (Q7 light theme is another slice).
