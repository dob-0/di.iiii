## A door to the lighting desk

The owner could not find the lighting desk. It was not broken and it was not
missing — nothing anywhere in di.iiii led to it. `/light/` could only be reached
by typing the address, and the one link that exists (the mapper's `Light`
action) is inside a tool you have to already be using.

The spaces list is the page people open to find things, so the door goes there:
one quiet line under the cards, above the sandbox row.

    ON THIS MACHINE   Lights  — the lighting desk, for the rig in the room

**Drawn from an answer, not a flag.** `probeLightingDesk()` in
`src/map/lightingLink.js` already existed for the mapper and already knows the
trap that matters: a hosted tier serves its own index.html for an address it
does not know, so a 200 alone is not a desk and the probe insists on JSON. This
reuses it rather than reading a tier flag, which means the row is right for
every case a flag would get wrong — a dev build pointed at a local backend, an
install serving the room over `--lan`.

`SpaceHub` is embedded by `LocalHome`, so the same line appears on the front
door of a di.iiii started with `di up`, which is where someone at a venue
actually lands.

Verified: the branch's dev server on :5199 against a real desk — the row
renders, `Lights` points at `/light/`, no console errors, screenshot read.
Two tests in `SpaceHub.test.jsx` cover both answers, desk and no desk.

Not in this change: the desk at :4748 is a different program on a different
port and cannot be probed from here; hosted `/light` still silently serves the
ordinary page instead of saying "this only works on your own machine".
