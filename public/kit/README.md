# public/kit

The stills on the Kit cards (`/tools`, `src/kit/kitCatalogue.js`). Each is a real
screenshot of that surface in di.iiii, nothing drawn or mocked: the top 16:9 of a
1440×900 Firefox screenshot, resized to 640×360, WebP quality 72 (2–21 KB each).

| taken | of | by |
|---|---|---|
| 2026-09-28 | every card except `light.webp`: the rehearsal tier, signed out | the kit audit's Playwright sweep (di-atlas `audits/2026-09-28-kit/`) |
| 2026-09-28 | `light.webp`: the lighting desk at `/light/` on a local install, Art-Net off the wire | the same day's Kit build, local stack |

Content: di.iiii's own pages and the works shown on them (WCC's artist projects, the
network space, br_id_ge). Licence: the program is AGPL-3.0; the works' pictures
belong to their authors and appear here only as they appear on the public site.

To remake one: screenshot the surface at 1440×900, then
`sharp(src).extract({top:0,left:0,width:1440,height:810}).resize(640,360).webp({quality:72})`.
