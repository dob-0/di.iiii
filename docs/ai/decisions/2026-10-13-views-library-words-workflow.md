# 2026-10-13 — views, the library, the words, the workflow: the owner's decisions

Asked after the cloud inventory of what MOXIR built (PR #901, `docs/ai/plans/2026-10-13-moxir-tools-into-di-iiii.md`).
Owner's answers (2026-10-13 19:5x), his words kept where they decide something.

1. **Views per project — YES.** Each project chooses which view buttons visitors see. Views are data in the project
   (`presentationState.viewPresets`: name, camera, live or work), set in the Studio; the viewer shows the live ones.
2. **Default for a new space with a building — "no, you choose".** The lead's choice: two views live at first, the walk at
   eye height and the plan; every other view is a work view until the author ticks it. A visitor never lands blind, the
   author's first choice stays small.
3. **All versions of a production share the same view buttons — YES.** The choice lives per production. *"We can use
   MOXIR as the example, but we don't mess the concepts of the local project with di.iiii's concepts."* The platform knows
   productions, projects and views; MOXIR is one instance, never a special case in code.
4. **One shared library of lamps and lasers — YES.** *"In time we will add devices; our task is to collect real, close
   data so it is right in real life."* Every type carries measured data with its source and date (datasheet,
   photometry; the provenance rule). *"Why is the whole fixture list loaded if you only need to see what is in the
   show?"* The viewer loads only the types a project uses.
5. **Words.** The looks (*"the wall"*, *"peak"*) and the Dilijan things get Studio-lexicon words in `docs/ai/vocabulary.md`
   (the word itself is still owed: he did not pick one). Mappings: not in this production, a future one will have them.
   The real need: **a connected workflow** — in MOXIR the Nodes and the Lights control the lights and the lasers;
   *"everything connected"*.
6. **Versions.** No scratch copy left aside. The MOXIR versions live in one place, selectable from inside, as version
   control and as examples. And the hard rule, his words: *"in future what we create will be auto-migrated; we will not
   create something and leave it behind — write it everywhere."* → `CLAUDE.md` "Nothing is left behind".

Means: about $500 of cloud credit on each of the two accounts and the two monthly API credits (ledger N574.1).
*"Check with the other agents, go work."* Build briefs: cloud routines #17–#19 (ledger N591+).
7. **The scene is the page (owner, 2026-10-13 21:xx, two screenshots of the view page at first load).** *"Look how many UI things
   pop up when you first load the view page; they cover the view; make di.iiii minimal, clear by default, users open a window when
   they need it; it must be di.iiii's own style; and it is not connected to the Studio, not manageable."* → every panel starts
   closed, one small control opens it, a viewer's opening is remembered for that viewer only; the author chooses in the Studio
   (Project > "What visitors see", per production, stored with the views) which controls the page has at all; the chrome is in
   di.iiii's tokens. Rule: `docs/ai/golden_rules.md` "The scene is the page".
