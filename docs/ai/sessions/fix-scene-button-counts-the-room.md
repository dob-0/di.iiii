## 2026-08-23 — "where did my cube go", and the phone topbar that had already lost its ⋯

- From the walkthrough audit: place a Cube in the node editor and no cube appears. It was the
  widest gap in the whole product between what a first-timer expects and what is on screen.
- **Working as designed — and the design was mute.** The desk is deliberately clear (owner,
  2026-08-20: "i mean clear desk"), so what you place stands in a room reached through the
  topbar's Scene button. That button said the same single word whether the room was empty or
  held your whole scene, so placing the first object changed nothing in the chrome.
- Fixed inside the ruling, not around it: **`Scene · 3`** counts what stands in the room at the
  current scope — spatial nodes in scope plus root-scope entities, the same rule the viewport
  draws by. Plain `Scene` when empty. No wallpaper; that was tried and rejected twice in August.
- **Then the phone said no**, and it turned out to be saying no already. Measuring at 390px:
  the bar carried **433px of content**, so the ⋯ button was off the right edge — on `dev`,
  before any of this. ⋯ is the only route on a phone to "Save to <space>", Spaces, Wiki and
  Home, so a phone canvas had no way to save the work on it. My longer label pushed the node
  count off too, which is how I found it.
- Both words now drop at ≤640px — "Projects" beside the arrow, "nodes" beside the count — never
  the controls. 83px bought; measured **390/390 with nothing off-screen**, and the ⋯ visible on
  a phone for the first time.

### The gate that should have caught it

`check:toolbar-overlap` is REQUIRED by `src/raw/AGENTS.md` for every topbar change, and it
tests whether siblings *intersect* — never whether the container overflows. Every child was
overlap-free while the last one sat past the edge, so it passed the whole time. It now measures
`scrollWidth` vs `clientWidth` as well, and was watched failing against `dev` (426/390).

### Worth carrying

- A checker's blind spot is not visible from its output. This one printed "0 overlaps" in a
  reassuring green while the thing it guards was broken — the same shape as the empty-bar bug
  its own header comment already records. Second time for this script.
