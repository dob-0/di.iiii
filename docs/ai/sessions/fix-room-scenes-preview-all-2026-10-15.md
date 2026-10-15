## 2026-10-15 22:0x — the room page: every scene clicks on a clock show (preview for this viewer, lasers too)

Owner: "why can't I use and click all scenes?" Measured on dev (`/moxir/p/moxir-v2-11`, agent browser, visitor): 50 cards in 5 pages,
EVERY card `aria-disabled` with "the show runs on its own clock" (the server's visitor block held the click before the preview branch),
and 22 cards `disabled` (the laser rule). So no card did anything.

Change (`RoomFavourites.jsx`): a preview (a clock show, `onPreview`) is this viewer's own page and posts nothing, so neither the server's
block nor the laser rule applies to it: `watching` is off when a preview exists, `disabled` is false in preview, the hover says
"preview, for you only", and `choose` previews first. Without a preview (a desk-driven show) nothing changed: laser = operator only,
a blocked visitor's card does nothing. Tests: the "blocked visitor gets no preview" test flipped to "still previews, posts nothing";
a new test: a laser scene previews on a clock show and stays operator only without one. `RoomFavourites.test.jsx` + the viewer test: 63 passed.
Not changed: the future `audiencePlays` hook; the stars (owed, PR #960 note).
