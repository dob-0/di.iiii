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
