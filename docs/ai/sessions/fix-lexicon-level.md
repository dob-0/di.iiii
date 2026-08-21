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

## 2026-08-21 — the tool doorway: append a word to a project link and it opens there

The owner's shape, in his words: *"it great when you can go in studio with just easy add
where you go and it run"*. And, on raw: *"raw and studio is for building so we can add layer
layer"* — so the project is the address and the tool is a view of it.

    /wcc/mery-petrosyan          the project, published        (already worked)
    /wcc/mery-petrosyan/studio   the same project, in Studio    NEW
    /wcc/mery-petrosyan/raw      the same project, node editor  NEW
    /wcc/p/<id>/studio           the same, on the permanent form  NEW

**A doorway, not an address.** The slug resolves, then the router `replace:`s the bar with
the lane's existing canonical path. No new permanent URL is minted, so nothing new has to be
supported forever — and it does not prejudge §7.1 of the URL spec, unsigned since 08-04,
which stages an addressing model where this level stops existing.

**It fixed a real silent fall-through.** `getAppLocationState` classified the two-segment
shape and never read `segments[2]`, so `/wcc/x/studio` AND `/wcc/x/banana` both rendered the
published project at HTTP 200 with the wrong URL in the bar. Measured on prod by rendering,
because the SPA answers 200 for every path.

Two things added beyond the plan the design agents produced, both from their own adversarial
pass: **`?query` and `#hash` are carried across** (every other heal in `RootApp` drops them,
which silently eats `?embed=1`), and **the `/p/` form gets the doorway too**, or "append the
tool" would have been true of the pretty link and quietly false of the permanent one — the
form published links actually use.

Three parts of that plan were deliberately **dropped**: a robots.txt change (it would have
de-indexed URLs the sitemap advertises — the pass's only blocker), an og:image rewrite, and a
server-side reserved-word guard on project creation that would have turned imports and backup
restores into hard 400s.

Verified in a browser against production data: all eight cases land correctly, and
`/wcc/mery-petrosyan/studio` reaches the editor's **auth gate** — "Sign in to open the editor
for wcc" — not the viewer. The doorway respects the permission model rather than routing past
it. Full suite: 269 client files pass, +10 new tests, failure set identical to baseline (12
serverXR files that cannot import `express` in this worktree).

## 2026-08-21 — the layering, Tier 1: one name per level, and a way across

Owner: *"still some thing wrong with namings so we need to do right layering, by example in
raw when you click back to projects it open .../open/raw/projects"*. He is right, and the
fault is deeper than that URL. Measured on staging, one space with one project, three entry
points behaving three ways: `/open/studio` redirects INTO the project; `/open/raw` opens a
blank canvas that is not that project; `/open/raw/projects` shows onboarding. And the same
space's projects have two addresses, each nested under a tool.

**The model** (from the audit, and it is just the dictionary made spatial): di.iiii holds
spaces; a space holds projects; a **tool is a way of opening a project, never a container**.

Shipped — Tier 1 only: copy, navigation targets and prompts. **No new routes.**

- **A way across.** Studio's cluster gains "Node editor", Raw's topbar gains "Studio →",
  both on the same project. Before this the only path between the two building tools was up
  to a list and back down, via a blank canvas. This is what the owner meant by *"raw and
  studio is for building so we can add layer layer"*.
- **One name per level.** `← Hub` → `← Projects` in Studio; Raw's back stops flipping between
  `Projects` and `Hub` for one destination; RawHub's `studio projects` → `studio`.
- **Two silent mis-targets fixed**: Studio's "Nodes" went to a blank canvas, not the node
  editor's projects; "Go to my spaces" went to one space's project list, not the spaces list.
- **The chat stops inventing counts.** Nothing injects the caller's spaces or projects, so
  every "you have N spaces and M projects" was fabricated. Both prompts now carry the
  hierarchy and an explicit rule against answering from nothing.
- Ops copy: the prod delete prompt says "N spaces — and the N projects inside them" (they go
  because their space goes); `project-pull` says objects, not the banned "entities".

**Tier 2 was dropped, not deferred by taste.** The audit proposed `/{space}/projects` and
`/spaces` as redirect aliases. Neither word is reserved — `PROJECT_RESERVED_SLUGS` is
{studio, beta, raw, seed, p} and `RESERVED_SPACE_SLUGS` has no `spaces` — so those aliases
would shadow a project legitimately named "projects" or a space named "spaces". Reserving
them now is itself a breaking change. It needs a decision, not a patch.

**Tier 3 (flipping the canonical to `/{space}/{project}/{tool}`) stays blocked** on §7.1 of
`SPEC_url_architecture_and_tree_addressing.md`, unsigned since 2026-08-04.

**Verified by looking**, not by passing: Raw's topbar at 1440 and 390 reads
`← Projects · Open Jam · Studio →` with zero slot overlap at all five checked widths.

Worth knowing: **`npm run check:toolbar-overlap` passes vacuously.** Raw defaults to zen, so
the bar is empty and the script reported "0 children checked" — a green run asserting
nothing. I measured with the zen preference forced off (`dii.raw.zen.<project>` = `off`), and
the check should probably do the same.

**Two honest gaps in this pass:**
- The cross-tool control is **desktop-only in Studio**. Studio's phone chrome is a separate
  topbar (`smb-topbar`) with room for three controls; adding a fourth would crowd a working
  surface at 390. Raw's works on both.
- Studio's cluster now shows `Projects` twice — a window toggle in WINDOWS, my `← Projects`
  in DISPLAY. Distinguishable by the arrow and the section headings, and still better than
  `← Hub`, which named nothing. Not clean.
- Raw still shows no space in its chrome (Studio does: `Atlas · estate map`). Left alone for
  the same 390px crowding reason; the space is in the URL and the back button's tooltip.

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
