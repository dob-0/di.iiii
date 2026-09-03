## 2026-09-03 — the network is all 52 of us, and two silent bugs came out with it

`/network` was a cream roster of pills naming 55 people, 8 of whom had a room. It is now the
full catalogue with a room for every person, plus the two other readings of the same data as
their own pages. Three directions were built and rendered before anything was chosen
(`network-directions/`); the owner picked B, then "b, but also elements from a", and the built
page is B's catalogue leading at two-thirds with A's field as a supporting margin.

### What shipped

- **`/network`** — every name on a numbered line; hovering one lights their node in the field
  beside it and shows their work as doors. **A line between two people means they made
  something here together, and only two works have** — measured, not decorated: `br_id_ge`
  (Gevorg, Emilya, Syuzi) and `azd` (Emilya, Syuzi, Yeva, Greta, Shahane). Six people, two
  clusters, forty-six single points. That is the truth about the studio and a better picture
  than a faked web.
- **`/network/<slug>`** — 52 rooms from one template. A person with work gets their doors; a
  person without gets *"Nothing stands here yet — this room is theirs to fill"* and their
  neighbours glowing beside them. 44 of 52 are in that state, so it is the common case, not
  the edge case.
- **`/network/constellation`** and **`/network/the-index`** — the field alone and the
  catalogue alone, as their own projects.
- **three.js vendored once** at `public/vendor/`, the way `draco/` and `fonts/` already are.
  Each room is 23 KB instead of 775 KB; the roster 49 KB instead of 801 KB. 733 KB in the repo
  instead of 40 MB.

### The two bugs, both silent, both older than this work

**A code page has no origin.** It renders in a sandboxed srcdoc iframe with no
`allow-same-origin`, so its origin is the literal string `null`. A webfont fetch and an
ES-module import are both CORS-mode requests, and a null origin fails them unless the response
allows it:

    Access to script at '/vendor/three.module.min.js' from origin 'null' — blocked
    Access to font   at '/fonts/inter-regular.woff'   from origin 'null' — blocked

The font half **has been true since code pages existed** — every page asking for the house
face has quietly been getting a system fallback. Nothing failed loudly enough to look. The
script half blanked every field on `/network`. Neither is visible to `curl`, which asks with an
ordinary origin and is answered perfectly; **you have to ask the way the frame asks.** Fixed in
`nginx.conf` and BOTH `express.static` mounts (so offline `di` installs match the tiers), scoped
to those two directories, guarded by `src/codePageCors.test.js`.

**Order is code, then data.** The pages were pushed to staging before the branch deployed, so
`/vendor/…` answered **200 with the app's fallback HTML** and every field went black. A status
code lied and I believed it. `space-sync` runs *after* the tier has the code.

### Also true, and easy to get wrong

- The sourced inventory cites its sources per field on purpose, and the generator must strip
  those citations: two artists' credits shipped carrying *"(per di-contacts core file; not yet
  in people.json)"* and a whole spelling argument about Kai/Kay Khachatryan. Fixed; the lines
  end where the credit ends.
- **No portraits of anyone exist on this machine** — the deck's photos were stripped in August.
  Faces are not on the table without new photographs.
- A di.iiii code page **cannot embed another page of the site**: `X-Frame-Options: SAMEORIGIN`
  meets the sandbox's null origin. Work previews are captured images, not live frames.

### Open

- **Prod has 9 of the 55 network projects.** They belong there, but the order is: promote
  dev→main, let prod deploy `public/vendor/` and the CORS rule, THEN `space-sync --all --tier
  prod`. Pushing the data first repeats the black-field failure on the live site.
- `di-funding` carries an uncommitted-to-remote branch `fix/one-copy-of-the-page` (the
  publisher was storing the page twice). Local and staging are single now; prod still holds it
  in the legacy `codeHtml` field and renders fine.
- The 23 debris projects in `open` are still local-only, still the owner's to delete. The three
  `look-*` projects are another session's live experiment, deliberately not swept.
