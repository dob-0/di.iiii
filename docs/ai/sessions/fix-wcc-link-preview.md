# /wcc previewed as the generic platform tile (2026-08-25)

`ogRoutes.js` gives every space its own link card, and it works — a crawler
fetching `/br_id_ge` gets a 984-byte card naming the space. A crawler fetching
`/wcc` got the **3548-byte SPA, byte-identical to what a human gets**, and
therefore the generic "di.iiii — public spaces on the open web" tile.

Cause: the crawler branch lives inside `location /`, and `location ~ ^/wcc/?$`
(added so the exhibition's own doorway loads the app rather than 403-ing on a
directory) matches first. So the one space with a hand-made doorway was the
one space whose link previewed as nothing — and it is the landing page's own
second chip, i.e. one of the most-shared URLs on the site.

Fix: repeat the crawler branch in the `/wcc` block, exactly as the security
headers are already repeated there for the same inheritance reason. Config
validated with `nginx -t` in a container.

Follow-up worth doing (owner's data, not code): the `wcc` space record has no
`ogTitle`/`ogDescription`, so its card will now read "wcc" rather than
"WCC: Women Creating Change". Setting those two fields on the space finishes
the job.
