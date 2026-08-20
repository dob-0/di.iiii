## 2026-08-20 — name what each create button makes, and stop two strings saying "project" about things that aren't

Fallout from a lexicon audit of the space/project pair. The audit's own recommendation was
**keep `project`** — every candidate replacement is already spent inside the product, and
`piece`, the strongest one, is live one level UP (`StudioCodeSpaceDirector.jsx:74` ships
"Open the piece" and it navigates to a *space* root, 26 lines from ":48 This space keeps its
work as projects"). So nothing here renames anything. These are the corrections that are
true under the current dictionary.

- **Three create buttons now name what they make.** `+ Create` (made a space) and `+ New`
  (made a project) sat one route apart, both unqualified; the node editor's hub said `new`.
  Now `+ New space`, `+ New project`, and `new project` — lowercase in the node editor
  because its neighbour is `import` and its register is its own. Looked at in a browser at
  1280 and 390: nothing clips, no row overflows, the widest row still fits a phone.
- **`/<space>/<page>` → `/<space>/<slug>`** in the wiki's published-page article. It was a
  live violation of the rule three sentences earlier, teaching the reader that the slot
  after a space id is *named* page when it holds a project's slug.
- **"Project Snapshot" → "Session Snapshot"** in preferences. It is subtitled with a space
  id and renders space routes, scene version, socket, scene stream, collaborators and save
  state — not one project fact. Deliberately NOT "Space Snapshot": over half of what it
  shows is session, not space.
- **Guard added** for the one that can silently come back: `copyVocabulary.test.js` now
  fails on any wiki string writing the slot after a space id as `<page>`/`{page}`/`:page`.
  Narrow on purpose — `page` cannot join `BANNED`, because it is both sanctioned prose (a
  published web page) and a live identifier (`window.diiPageQuery`). Confirmed by putting
  the exact defect back and watching it fail, then restoring.

Two rows added to `docs/ai/known-fixes.md`.

## 2026-08-21 — the last two create buttons, on the owner's call to fix all of them

- **`AdminManageSection.jsx`: "Add project" → "Create project".** NOT the audit's suggested
  "+ New project": that console uses bare verbs throughout — Create space, Save, Cancel,
  Rename, Search — and no `+` anywhere, so a plus would have broken its register. "Create
  project" now matches its own "Create space" in the New Space form. Seen on screen.
- **`StudioProjectsPanel.jsx`: `＋ New project` → `+ New project`.** The fullwidth `＋` was
  the only one in the whole studio tree; every sibling create button uses ASCII. **Not seen
  on screen** — that panel does not surface from any route reachable with the local dev
  data, and I would not write test projects into another session's dev database to force
  it. The same string renders correctly in `StudioHub`, which was verified, so the glyph
  itself is proven; its placement in that panel is not.

**Not done here:**

- `scripts/works-boundary.mjs` — the one place the repo states `project ⊇ space`, the exact
  inverse of the dictionary — is **not on `dev`**. It lives only on
  `feat/clean-local-artifact`, which is checked out in another worktree, so the fix went to
  its own branch `fix/works-boundary-wording` rather than into someone else's in-flight work.
- The audit's larger finding is untouched and is the real one: production runs **12 spaces,
  26 projects, median 1, mode 1 — 8 of 12 spaces hold exactly one project**, and `wcc`, the
  one genuine multi, already fakes nesting with 10 portal entities inside its `main`
  project. The level is the defect, not the noun. Anything structural waits on §7.1 of
  `SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04, which stages an
  end state where this level stops existing.
