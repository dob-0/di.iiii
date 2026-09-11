## 2026-09-11 — walked iiii's private conversations as two people, and as a guest

Two accounts, two browsers, phone and desktop viewports, on the local tier. What the
feature does was confirmed by doing it: the two sides connect, both print the SAME
fingerprint, words cross in about a second, a reply carries its quote through the
sealed body, history survives a reload, and the conversation appears in the list
afterwards. Four things were wrong around the edges of that, all found by looking
rather than by a test, and all fixed here.

- **A dropped conversation had no way back.** The connection lives in one effect keyed
  on the other person, so `closed`/`lost` were terminal — the only exit was reloading
  the page, and nothing on screen said so. Now: one automatic retry four seconds after
  the drop, then a "Try again" button. Bounded on purpose; an endless retry would draw
  "finding them…" forever over a room nobody is in.
- **The composer explained itself in an invisible colour.** MUI paints a disabled input
  with the browser's own near-black disabled fill, so "Not connected yet" was in the DOM
  and unreadable on the black field — a dead box with no reason. Measured with
  `getComputedStyle`, not guessed.
- **A guest was told the wrong reason, twice.** The people picker said "nobody shares a
  space with you" and a private link said "you may not share a space", when the server
  had answered 401 "Sign in with an account to talk privately." in both cases. Both call
  sites now keep the server's own words.
- **`/login` answered "Nothing lives at “login”".** It was never a route: the address a
  teammate is sent to fell through to the space lookup, above a sign-in form that worked
  perfectly. It is a real surface now, and the word is reserved on both sides (checked
  first — no space answers to it on prod, staging or diiii.xyz).

Guards: `PrivateChatSurface.test.jsx` (4), `ChatHomeSurface.test.jsx` (2),
`spaceRouting.test.js` (3). Four rows added to `docs/ai/known-fixes.md`.

Not done, and deliberately: the six-word fingerprint sits in the header with no label,
so nobody unprompted knows what it is for — the tooltip only exists for a mouse.
