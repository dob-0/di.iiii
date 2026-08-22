## 2026-08-22 — the front door, the copy, and a page you could see but not open

Three commits straight onto `dev` (`ea2dd731`, `af8a3b0e`, `466f2b17`), each one
looked at in a browser before it was called done.

- **A legacy `codeHtml` page opens in the Code window again.** `funding-board`
  keeps 299,595 characters in `presentationState.codeHtml`, from before the file
  list existed. The viewport rendered it, so the owner could *see* the page while
  the Code window said "No code files yet" and offered a manual convert button —
  visible and unopenable at the same time. The file list now falls back to
  `codeHtml` as `index.html` and the first write migrates it (render-identical: a
  lone index.html bundles to itself). The editor had to become usable first: a
  whole-page file re-issued a document op per keystroke and the autosizing field
  re-measured the whole file each time, growing to the page's height instead of
  scrolling. Now a bounded scrolling box with a local buffer that commits on idle,
  on blur and on unmount — **4ms per keystroke** on the 299KB page.

- **"Step inside" opens the visitor's own space.** It pointed at `/open/raw`, the
  browser-local canvas; `4b897db8` gave that canvas an exit the same day, but a
  first visitor still has to know to use it. The door now lands where Projects and
  **Nodes** already sit side by side with View live — so the Studio↔node-editor
  connection is made by the door choosing the room that holds both, with no bridge
  to build. This is doors-audit owner decision 1, and the positioning doc's item 4.
  Mechanics: the four doors keep `href="/spaces"` as a real destination (no-JS,
  middle-click, crawlers) and upgrade on click; `getApiSession()` runs on the
  CLICK, never on a page view, because asking for a session mints one.

- **The copy says what di.iiii is.** Hero, eyebrow, tab title and both share cards
  now carry the 2026-08-21 position (*the visit is the product; the editor is
  backstage*). Two sentences were false and are gone: "Nothing is empty when you
  arrive: a live 3D room…" (untrue since the starter seed was deleted) and "Sign
  in only to edit" (untrue the moment the door hands out an editable sandbox).
  "Immersive" is on the refusal list and left with them.

Measured, so nobody re-derives it:
- The landing's decorative hero already calls `/api/auth/session` on every desktop
  view (`LiveProjectScene.jsx:1389 → ensureGuestSession`), so "nothing is minted on
  a passive visit" was already half-false. It mints a session but **no space row** —
  the sandbox row appears only when someone actually opens it.
- The landing is not slow any more: hero visible **1.6s on prod**, 0.9s on dev. The
  10.2s figure in the positioning doc is stale.

Paid for twice, worth writing down:
- An uncommitted edit in this shared checkout can be **silently wiped** by another
  session's checkout — `wikiContent.js` was back at HEAD an hour after being edited,
  no stash, no diff, while five sibling files survived. Grep for your own edit
  before reporting it done.
- `npm run test` does not run the docs gate. This push failed CI on a session note
  left by another branch — run `node scripts/check-agent-docs.mjs` AFTER rebasing,
  not before.
