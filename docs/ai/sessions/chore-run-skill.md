## 2026-09-11 — a skill that can actually drive this thing, gate and all

`npm run verify:surfaces` sweeps the public surfaces of a tier and signs in as
nobody, so everything behind the gate — the editor, Raw, a space's room, a private
conversation — has never had a harness at all, and neither has anything that needs
two people in it at once. `.claude/skills/run-di-iiii/` is that harness plus its
man page: `driver.mjs` makes accounts, scopes them to spaces, signs browsers in as
them, and holds two of them open side by side; `SKILL.md` is everything I had to
learn to write it.

Written by doing it, on a deliberately clean tree — deps reinstalled from nothing,
`npx playwright install chromium`, the stack started with no env files at all to
see what a fresh clone gets.

**What a fresh clone gets is a stack that will not start.** `serverXR/.env` and
`.env.local` are both gitignored, `serverXR`'s dev script watches both by name, and
`node --watch-path=.env` throws `ENOENT` and kills the run before anything prints
about a server. `cp serverXR/.env.example serverXR/.env && touch
serverXR/.env.local` fixes it and is now step one of Setup. Worth fixing in the dev
script rather than only documenting — left alone here on purpose, since this branch
is a skill and not a change to how the server boots.

The Gotchas section is the rest of what cost time: a dead `node --watch` holding
the port while serving yesterday's code (already a known-fixes row, now with the
two-processes detail), `networkidle` never settling because socket.io holds a
connection open, MUI's hidden second textarea, two controls called "Sign in" on the
sign-in card, a refused sign-in leaving you on a working guest session with nothing
but a console 401 to say so, and usernames being 3–32 characters.

Verified by following SKILL.md line by line in a fresh shell.
