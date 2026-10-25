# fix/dilijan-camp-address

## Dilijan's address is /dilijan-camp, and its front page builds with each server's own image ids

- 2026-10-25 owner: "make it /dilijan_camp" (an underscore is refused by the platform: lowercase, numbers, dashes) -> yes to
  /dilijan-camp; "keep only this": every link and door names /dilijan-camp; /dilijan (the space id) still opens it, so links
  already shared keep working.
- apply-structure `address`: sets the space's slug, moves every quoted link into the space in every page (plain, escaped and
  srcdoc quotes; `moveAddressHtml`) and every door into it (`moveAddressPortals`), after all other steps; tests 4 passed.
- Owner's screenshot (dev front page, the yard as one broken piece): two of the yard's photos 404 on dev. A tier given an
  already-cleaned copy of an image stores it under another id (memory: asset id churn); dev's the-yard page carries dev's ids,
  the front page carried the repo's. `front/build.mjs --ids-from API` takes them from that server's own page (same page, same
  order; refuses otherwise). Seen on dev: 49 loads, 0 failed, the whole building.
- Applied: dev (slug, 15 pages, the hall's 7 doors + 5 rooms' doors), the test copy, own di (slug by its API; the follow
  refused the whole-page replaces -> `di follow dilijan --take-host`, restore point first; hall arrived with the new doors).
- Owed: a follow does not carry a space's slug (own di had to be set by hand through its API); the e-door-6 re-write on every run.
- 2026-10-25 owner: "check one by one everything, all bugs". `scripts/space/sweep-space.cjs` (run with di-test-browser): every
  public project of a space, page/console errors, failed loads, every link and door followed (a /space/project must exist and
  be public; a link with the space's old id is flagged), a wide and a phone picture; report.json. Run on dev, 14 pages.
  Found and fixed: (1) the viewer's "everything in this space" link used the space id (/dilijan/projects): the surface now
  passes the address (`spaceAddressOf`, slug or id); (2) three worlds (mushroom-house, orange-room, tsaghkanots) loaded their
  files from prod by full address: apply-structure `relativeAssets` makes them relative where the server has the file (dev: 5).
  Checked, not bugs: WebGL/shader errors are the agent test browser (NVIDIA shader compiler, dob-67 N1271.7); the same five
  worlds draw with 0 WebGL errors on software GL; /api/resolve/<space> 404 is the designed "no forward" answer; the flower
  garden's optional artifact runtime (_runtime/_transforms) is not hosted (the page catches it, draws fine);
  unicode-fonts 404 falls back to the CDN (pre-existing).
