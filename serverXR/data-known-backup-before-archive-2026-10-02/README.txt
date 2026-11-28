Backup of PONYO's data-known/di.db (+ moxir scene.json), 2026-10-02, taken before
archiving the 14 MOXIR versions that are not all tested charts and publishing
"Known · full" in place of "Minimal" (Emily: "audit all version designs, keep only the
real ones"; agreed with emily-9f).

DO NOT PUSH THESE CHANGES UPSTREAM WITHOUT GEVORG'S YES.
data-known is PONYO's local copy of Gevorg's moxir data. If a dev data push ever runs
from data-known, the archived states and the published change (Minimal → Known · full)
must NOT go up to Gevorg's dev space unless he has said yes to them.

Kept live: moxir-hall-known-full (published), moxir-hall-known-ground (on the desk),
moxir-sources, moxir-truss. moxir-hall (base hall, already archived) still builds.
Restore: stop the :4100 server, copy di.db back over data-known/di.db, start it again.
Or un-archive one: PATCH /api/projects/<id>/shelf {"state":"live"}.
