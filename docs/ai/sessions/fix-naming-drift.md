## 2026-09-01 — the front door stopped advertising a closed show

Two strings and one dead path, all found by a four-agent naming audit and each
verified by hand before it was touched.

- **The landing advertised `br_id_ge · live at Notations #2` for a month** — the show
  closed 2026-08-02. `FEATURED_SPACES` hardcodes the four featured labels rather than
  reading the space rows, so a dated claim written into a constant has nothing to
  expire it. Claim removed.
- **The same list called Beyond Form `beyond_form`**, an underscore form that appears
  on no other surface — its DB label, its card and its own page all read "Beyond Form".
  Aligned, and the four labels checked against prod.
- Guard: `LandingPage.test.jsx` "names featured spaces without dating them" pins each
  button's label and rejects `live at` / `#<digit>` / a bare year. Watched failing
  against the stale string first. The four `className`s are NOT derivable from the ids
  (`algovrithm` → `landing-cta-algo-vrithm`) — that cost the first version of the test.
- **`docs:wiki:check`'s freshness clock watched `src/beta`**, deleted 2026-08-06.
  Removed. The widening it also wants — `src/raw`, `src/make`, `src/map`, `src/wiki`,
  `src/components` are all unwatched — is deliberately left out: turning it on would
  start failing other agents' in-flight branches mid-session. It wants a quiet tree.

Not done here, and waiting on the owner rather than on work: whether `di.i` still
signs (`NAMING.md` says it does, `vocabulary.md` calls it retired and a regex enforces
that); whether the three-space limit is a commons fact or a funnel; whether the
position names Armenia. The audit's full findings live in the session transcript.

Done on the data side the same day, outside this branch: the four renames owed on prod
since 2026-08-23 (`di.ii` → Works, `platform-recordar` → RecordAR, `wcc` → WCC
Exhibition, `di.i: open_space` → Everything made here) and owners for the five
ownerless prod spaces. Both were API writes, not code.
