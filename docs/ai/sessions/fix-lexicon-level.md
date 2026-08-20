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

**Deliberately not done here:**

- `AdminManageSection.jsx` ("Add project") and `StudioProjectsPanel.jsx` ("＋ New project")
  were in the audit's list but are already qualified about level. Changing them is verb
  and glyph tidying, not the defect, so they were left alone.
- `scripts/works-boundary.mjs` — the one place the repo states `project ⊇ space`, the exact
  inverse of the dictionary — is **not on `dev`**. It lives only on
  `feat/clean-local-artifact`, which is checked out in another worktree. Still owed, on
  that branch or after it merges.
- The audit's larger finding is untouched and is the real one: production runs **12 spaces,
  26 projects, median 1, mode 1 — 8 of 12 spaces hold exactly one project**, and `wcc`, the
  one genuine multi, already fakes nesting with 10 portal entities inside its `main`
  project. The level is the defect, not the noun. Anything structural waits on §7.1 of
  `SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04, which stages an
  end state where this level stops existing.
