## 2026-08-19 — the cut list: a minimal desk

Third of the three audit answers ("you're shitting the UI with useless infos —
keep UI clean and minimalistic"). Every cut is one the audit counted; the
result was measured the same way it measured the problem: **first visit
71 → 18 visible words** (desktop; 15 on a phone; TouchDesigner shows ~50),
**one placed cube 95 → 27**, with a screenshot read at each state.

- **The starter seed is gone.** First visit is the clean empty room — one
  sentence, one offer. The demo lives behind "Make me a scene", where choosing
  it is the person's act. Its four-node constellation, two open windows and
  phone layout collisions go with it (`starterWorkspace.js` + its test
  deleted; the zen default no longer needs the seeded-flag special case).
- **The dead CODE box is gone from every fresh node** — the audit's one
  systemic clutter generator. `Code — stored, not run` appears exactly where
  it is true: node.null always, anything else only when `values.__code`
  actually carries something. Contract test rewritten truthfully.
- **Window title bars spell three actions with glyphs** (⌖ – ×), words kept in
  the accessible names; Enter › keeps its word — it is the one action a
  first-timer must find.
- **The ◫ "world as background" button is gone** — the permanent backdrop made
  it a synonym for Close. ● live-marking stays (it has a real job with several
  rooms).
- **The scope marker's four-word explainer is a ?** (44px, full sentence in
  title/aria); the empty-canvas "Show me what it's made of" now appears only
  inside CODE-made nodes, where the empty canvas is the question.
- **Topbar**: Size select moved into ⋯ (configuration, not work); Chat hidden
  on a solo local canvas until presence shows anyone; "Blank White Workspace"
  — neither blank, nor white, nor (vocabulary) a workspace — is now
  "Local canvas".
- **The empty-state offer moved to the lower band** — the audit watched a
  double-click land on the centred button and inject a demo into somebody's
  node, because the hint says "double-click" and the centre is where people
  do it.
- **Palette: exact label match outranks every substring match** — typing
  "Out" + Enter used to open an Outliner panel, detonating the documented
  door flow on its own palette. Guard watched red without the sort.
- **New cards step aside until clear** — a Merge used to bury a Cube's whole
  header, and a card over another's door left that door silently unclickable.
- **Help lost the repo path line** (`docs/raw/USER_MANUAL.md` shown to
  visitors); the wordmark no longer renders on phones (it sat on the cards);
  the backdrop no longer honours a topbar zen doesn't show (dead band, seen).
- Wiki updated where it described the seeded desk as fact.

### Verified

First visit, one-cube, and phone states driven and screenshot-read after every
cut; the one-cube screen now shows the cube standing in the room exactly where
the double-click landed, its card beneath it, an inspector with no dead box.
No console errors anywhere.
