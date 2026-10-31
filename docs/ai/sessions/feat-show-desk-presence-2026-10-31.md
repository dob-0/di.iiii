# Show desk presence: who is on, who touched what (2026-10-31)

The owner, 23:0x: "make colours like if someone is active, that is coloured around". Branch `feat/show-desk-presence-2026-10-31`
from `c19a83534`, two commits: **U** (the page, static files, no restart) and **S** (the server half, needs a serverXR restart).
Design and evidence: `~/work/agent-reports-2026-10-31/projector-room/show-presence/` (design.md, REPORT.md, the shots).

## What it does

- A person touches a control on the Show desk: the control gets a 2 px square ring in that browser's colour, the desk's frame (3 px)
  takes the colour of whoever touched last, and the ring fades from 1.5 s to 4 s after the last touch (`ringAlpha`, presence.js).
- One colour per browser for the night: six tokens `--c0..--c5` in show.css (deep red, purple, amber, white, mint, magenta; the
  owner's four, then two of the laser desk's own swatches). The board gives each browser the first colour from its hash upward that
  no other browser holds; with all six held, a newcomer shares the colour whose latest holder has been quiet the longest.
- "ON" and one chip per browser in the top line (a 10 px square and the name; the one touched in the last 4 s has a 2 px outline). The
  name is set once per browser with the Name button in the bottom line (12 characters, Enter keeps it, Escape leaves it, kept in
  localStorage `diShowDesk.who.v1`); the default is Mac, phone or tab by the device. A repeated name is numbered (phone, phone 2).
- `?presence=0` turns all of it off: the page as it was (kept as a mode).

## How it travels (neither desk is edited)

The page names itself on requests it already sends: `X-Di-Client` (12 hex), `X-Di-Label` (percent-encoded name) and, on a write,
`X-Di-Control` (the key of the control: `lamp:<id>`, `scene:<id>`, `blackout`, `light-master`, `live:<field>` …). `touchBoard.js` keeps
the roster and the last touch of each control in memory only (12 browsers, 64 controls, a touch 6 s, a browser 8 h). `observeDeskWrites`
(routes/showDeskRoutes.js) is registered in index.js BEFORE the lighting desk and the lasers and tells the board about a write only
after the desk answered it with a status below 400; it never reads a body and a throw in it is caught. The page reads the board in
its own 1 s tick with `GET show/api/who` (ages in ms, never wall-clock). An older server answers 404: the page keeps its own rings
and asks again every 30 s. A write of this browser that does not come back in the next two answers makes the status line say so once.

## Files

U: `showDesk/ui/presence.js` (new, the rules), `show.js` (wiring), `index.html`, `show.css`; tests `showDesk/presence.test.js`,
`showDesk/showDesk.test.js`. S: `touchBoard.js` (+ test), `routes/showDeskRoutes.js` (+ test), `index.js`, `catalogue/entries/showDesk.js`
(GET /show/api/who), wiki `show-desk`, this note and the routes list of `feat-show-desk-2026-10-31.md`.

## Tests

- `npx vitest run serverXR/src/showDesk serverXR/src/laser serverXR/src/lighting serverXR/src/httpContracts.test.js`, exit 0 both times. Before (c19a83534, the same command, run in a detached worktree): `Test Files  36 passed (36)`, `Tests  664 passed (664)`. After: `Test Files  37 passed (37)`, `Tests  689 passed (689)` (+25: presence.test.js 16, showDesk.test.js 9; every existing test unchanged).
- `npx vitest run serverXR/src/catalogue serverXR/src/routes/showDeskRoutes.test.js serverXR/src/touchBoard.test.js`: `Test Files  3 passed (3)`, `Tests  24 passed (24)` after the last fix (23 before it) (the route's 10 with the observer and the index.js order test, the board's 11, and the catalogue's).
- `npx eslint` on every changed file: 0 errors; the 4 warnings in index.js are on lines this change did not touch (162, 276, 1093, 1979).
- The words check `tools/lint-words.sh` is a di-atlas tool and this repo has no copy at c19a83534: not run on these files; the page says "who is on", "Name", "browser" (never client, room, user), by hand.

## Measured (scratch stack of this worktree, headless Chromium; A = Mac 1280x700 Compact, B = phone 390x844 Touch; look.cjs, look-results.json)

- Compatibility: the same write with and without the three headers answers the same (status and body) on four real routes: light master,
  light scene recall, laser master, laser bpm (seed-and-compat.log).
- M1 request bytes added per write: at most 78 B over 33 writes (target 260; an Armenian 12-letter name adds about 62 more).
- M2 `api/who`: median 911 B, largest 1057 B over 74 answers, mostly with six browsers on (target 1 KB: the largest is 6 % over it).
- M3 a touch on B to its ring on A: 30 of 30 seen, p50 530 ms, p95 855 ms, max 989 ms (target p95 1.2 s).
- M4 idle cost: a page with no ring running 10 s sets 0 timers of 200 ms (with presence on and off alike); it sends 10 more requests than with `?presence=0` (one `api/who` a second:
  60 against 50). During a ring the 200 ms step runs (17 steps in 3 s) and stops after the fade (0 in the next 2 s). A ring moved no element and no scroll size (layoutShift true).
- M6 the top line (compare-top-line.json; four browsers on, the stage Mac's state). The legend is two rows at most 120 px (Compact) or 124 px (Touch) wide, cut whole at the third row.

| size | presence | what is on (shown of natural) | status line | legend |
|---|---|---|---|---|
| 1280x700 compact | off | 334 of 335 px | 220 px | hidden |
| 1280x700 compact | on | 330 of 335 px | 100 px | 3 of 4 chips in 120 px |
| 1278x758 touch | off | 325 of 368 px | 195 px | hidden |
| 1278x758 touch | on | 284 of 368 px | 100 px | 3 of 4 chips in 124 px |

  The lifts stay 24 px clear of Blackout all at 1280x700, 1278x758 and 390x844. At 390 px the top line already overflowed before presence (content 738 px in 390): the legend has no room there, the rings and the frame still show.
- M7 contrast of the six colours on `--bg` / `--pane` / `--cell` (WCAG 2.1 SC 1.4.11, 3:1 for non-text, re-run on the final CSS): deep red 3.90/3.73/3.60, purple 3.24/3.10/3.00 (the weakest: the owner's colour, 2.995 unrounded in the design's script), amber 10.69/10.24/9.89, white 16.68/15.97/15.43, mint 14.83/14.20/13.72, magenta 5.99/5.74/5.54. Colour is never the only cue: the legend names every colour.
- No console error and no page error in four pages over the whole run. The Show desk declares `color-scheme: dark` and has no light theme: a light-scheme browser gets the same dark page (shot 07 is the same as 04).

## Limits (stated)

- A name and an id are what a browser claims, not a login: cosmetic. Anyone who can reach the desk can claim any id; the caps bound memory. Roster and touches die with the server process (colours may change after a restart).
- A ring on another screen lags the touch by 0.03 to 1.0 s (the 1 s poll is a rule: "never faster"). The native Light and Laser pages do not send the headers, so moves made there do not ring.
- The top line is full at 1280 px: the legend takes its room from the status line (220 px to 100 px; the whole message is now in the line's title) and a little from "what is on". With more than four browsers the rest are cut (their rings still show; the legend's title lists the idea, not the names). The cheapest alternative is the bottom line, which has room for six: one move in index.html and one CSS rule; the owner decides.
- Not tested here: the Mac, the real DMX gap of a restart, a real phone, two real machines, the aylmo gateway passing the headers (the self-check message would say so).

## Owed

Send the three headers from the native Light and Laser pages; di + node on r-di (no rehearsal there yet); the DMX gap of a serverXR restart on the Mac (unmeasured); the owner's look at the Mac after S; his word on the legend's place.

## Lesson (for the brief template)

Read the suite's rules as design constraints before any code (the colour list, no timing word in show.css, tokens-only Compact, the body's children): they decided the ring (a `::before` border, never outline or box-shadow) and the fade (stepped by the page). And when something is added to a row that is already full, measure its neighbours before and after (compare.cjs): the first version squeezed "what is on" to two letters.
