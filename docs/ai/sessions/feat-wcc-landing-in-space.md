## 2026-09-10 — the WCC landing page is listed in its own space, as itself

The owner opened the WCC space, saw eleven artist rooms and asked where the
landing page was. A previous session answered it by compiling the page into a
`code` project (`scripts/wcc-page-snapshot.mjs`) — visible, but dated, labelled
"Snapshot", and a second source of truth. He said plainly he meant the real
page: "i mean landing page — this page", pointing at `di-studio.xyz/wcc`.

The platform already had the right shape for this and it was not being used for
wcc: `works.js`'s `codeSpace` block, which is how algovrithm's code scene shows
up in Studio instead of "No projects yet".

- `src/works/works.js` — the wcc entry gained a `codeSpace` block: `title`
  ("Landing page" — "WCC Exhibition" is the space's own name and says nothing as
  a row), `kind: 'code'`, a blurb, and `sceneLabel`/`scenePath` for the ring at
  `/wcc/scene`. No `director`: wcc has no piece descriptor.
- `src/studio/utils/codeSpaces.js` — the director half is now derived only for a
  work with `director: true`, so a work without one gets no button to a surface
  that renders its own "nothing here". Added `title` and `kind`.
- `src/studio/components/StudioHub.jsx` — Director and the scene action are each
  rendered only when the registry gives them.
- `src/pages/SpaceContentsPage.jsx` — asks the registry as well as the server, so
  a code page is listed in line with the projects. It carries "the way in", and
  the stored `publishedProjectId` does not: where a work shadows a space the
  router hands `/wcc` to the code before any space route sees it, so the door the
  database names is reachable only at its own address.

Nothing about the route changed — `/wcc` is still the compiled microsite, and
removing it would have broken thirteen concrete things (asset paths, `/wcc/scene`,
the sitemap, the CORS allow-list, five test files). The landing is still edited in
`src/wccSite/`, not in the editor; the list says so on the card.

Still open, for the owner to say: the two snapshot projects
(`landing-page-snapshot`, `artists-works-page-snapshot`) now sit in the list
beside the real page. They exist on the LOCAL tier only. The landing snapshot is
a duplicate of the row above it and should probably go; the artists-works one is
the only listing of a page that is otherwise reachable only inside the landing's
second panel.
