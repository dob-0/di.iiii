---
name: run-di-iiii
description: Build, run, and drive di.iiii — start the dev stack, sign in as a real account, screenshot a page, walk a two-person flow, or run the tests. Use when asked to run di.iiii, start the dev server, take a screenshot of a surface, check something behind the sign-in gate, or reproduce a collaboration bug.
---

di.iiii is a Vite/React front end (`:5173`) talking to an Express + `node:sqlite`
back end, `serverXR` (`:4000`), started together by `npm run dev`. Almost
everything worth looking at is **behind the sign-in gate**, and several of its
surfaces only do anything when **two people are in them at once** — so the agent
path is not "open the page", it is
`.claude/skills/run-di-iiii/driver.mjs`, which makes accounts, signs browsers in
as them, and can hold two of them open side by side.

All paths are relative to the repo root.

There is a second harness already in the repo and it does a different job:
`npm run verify:surfaces -- --base <url>` sweeps the PUBLIC surfaces of any tier
for console errors, overflow, occlusion and tap-target sizes, and writes a
screenshot per page × device to `.verify-surfaces/`. It signs in as nobody. Use
it for a public sweep; use the driver for anything gated or shared.

## Prerequisites

Node **≥ 22.5** — the server stores everything through `node:sqlite`, which does
not exist before that. There is no `sqlite3` CLI and no `better-sqlite3` here;
`require('node:sqlite')` is the only way into the database.

```bash
node --version     # v22.23.2 on this machine
npx playwright install chromium
```

The system libraries Chromium needs were already present here; if it fails to
launch on a bare box, `npx playwright install --with-deps chromium` is the fix.

## Setup

```bash
npm install
npm --prefix serverXR install
cp serverXR/.env.example serverXR/.env
touch serverXR/.env.local
```

**Those last two lines are not optional.** Both files are gitignored, so a fresh
clone has neither, and `serverXR`'s dev script watches both by name —
`node --watch-path=.env` throws `ENOENT` and takes the whole stack down before
it prints anything about a server. A fresh clone cannot run `npm run dev` until
they exist.

The example env is a working local configuration: port 4000, API under
`/serverXR`, `REQUIRE_AUTH=true`, and its own data root at `serverXR/data/`
(created on first boot). A visitor with no account gets a guest session scoped to
`open` plus a private sandbox — which is why the driver makes accounts.

If this checkout is meant to share one machine-wide local tier instead, that is
what `serverXR/.env.local` is for (`DATA_ROOT=/path/to/tier`); it overrides
`.env`, and the driver reads both to find the database.

## Build

```bash
npm run build          # -> dist/, ~1s warm
```

## Run (agent path)

Start the stack and wait for the port rather than sleeping:

```bash
npm run dev > /tmp/di-iiii-dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf http://localhost:4000/serverXR/api/health >/dev/null; do sleep 1; done'
timeout 60 bash -c 'until curl -sf http://localhost:5173/ >/dev/null; do sleep 1; done'
```

**Drive `:5173`, never `:4000`.** Port 4000 serves the last `dist/` build, so it
happily answers with code from some previous day; 5173 is the source you just
edited. On 4000 the API also lives under `/serverXR` — a bare `/api/...` there
returns Express's own 404 HTML, which reads exactly like a dead server.

Stop it by the ports, not by name:

```bash
for p in 4000 5173; do lsof -ti:$p -sTCP:LISTEN | xargs -r kill -9; done
```

### The driver

```bash
node .claude/skills/run-di-iiii/driver.mjs account ann --spaces main
node .claude/skills/run-di-iiii/driver.mjs look /chat --as ann --phone
node .claude/skills/run-di-iiii/driver.mjs pair /chat --as ann,bob --phone
```

| command | what it does |
|---|---|
| `account <name> [--spaces a,b]` | registers the account (re-running is fine — a taken name is not an error), scopes it to those spaces, prints its id and password |
| `look <path> [--as <name>]` | opens one page as that person, screenshots it, prints what is on screen and any console/page errors. Exits non-zero if anything threw |
| `pair <path> --as <a>,<b>` | the same, twice, in two independent browsers — for anything that needs two people |

Flags: `--phone` (390×844 at DPR 3, which is the phone this platform is actually
opened on) or the default desktop (1440×900 at DPR 2); `--wait <ms>` before the
screenshot; `--base`, `--api`, `--out` (default `/tmp/di-iiii-shots`).

Screenshots land in `/tmp/di-iiii-shots/`. **Open them.** The driver reports
console errors, not whether the thing you changed is legible, and this repo's
largest class of shipped defect renders without throwing anything.

`--spaces` matters: a person can only read a space's room, or start a private
conversation with somebody, if the two of them share a space. `main` is the
studio's own space; a guest never has it.

### A flow with steps in it

For anything the three commands don't cover, import the same pieces. This is the
two-person private conversation in `iiii`, run exactly as written:

```bash
cat > flow.mjs <<'EOF'
import { chromium } from 'playwright'
import { person, open, shot, readOut, composer } from './.claude/skills/run-di-iiii/driver.mjs'

const browser = await chromium.launch()
const ann = await person(browser, { as: 'ann', phone: true })
const bob = await person(browser, { as: 'bob', phone: true })

for (const [page, them] of [[ann, 'bob'], [bob, 'ann']]) {
    await open(page, '/chat')
    await page.getByLabel('Start a private conversation').click()
    await page.getByText(them, { exact: true }).first().click()
    await page.waitForTimeout(2000)
}
await ann.waitForTimeout(2000)

const box = composer(ann)
await box.click(); await box.fill('does this reach you?'); await box.press('Enter')
await bob.waitForTimeout(1500)

console.log('BOB SEES:\n' + await readOut(bob))
console.log('\nshot:', await shot(bob, 'private-bob'))
await browser.close()
EOF
node flow.mjs
```

It prints Bob's side of the conversation, including the fingerprint both browsers
must agree on:

```
BOB SEES:
LOCAL
ann
connected, just the two of you
3542 e07b f340 0880 849b c98d
does this reach you?
04:36 PM
Forget this conversation on this device

shot: /tmp/di-iiii-shots/private-bob.png
```

(`LOCAL` is the tier chip every surface carries; the six words are the
fingerprint, and the same six have to appear on Ann's side.)

## Run (human path)

```bash
npm run dev     # -> http://localhost:5173/ , Ctrl-C to stop
```

## Test

```bash
npm run lint
npm run test
CLIENT_DIR= npm run test:server-contracts
npm run docs:ai:check
```

On a clean tree here: lint 0 errors (65 warnings), `test` 415 files / 4312 tests
passing in about four minutes, `test:server-contracts` 7 files / 130 tests.

`docs:ai:check` is a real gate, not a formality: it fails the dev deploy if a
branch has no note in `docs/ai/sessions/`, or if `CURRENT.md` differs from
`origin/dev` (only `npm run land` writes that file), or if `CURRENT.md` passes
its hard 50-line cap.

## Gotchas

- **A dead `node --watch` keeps the port and serves yesterday's code.** Every
  restart after it dies with `EADDRINUSE`, prints that into a log nobody reads,
  and exits — while the original process keeps answering. A route you just added
  404s while the file plainly registers it. `ss -ltnp | grep :4000`, then
  `pgrep -af "src/index.js"` — the `--watch` parent and its child are two
  processes and killing the parent leaves the child on the port.
- **`waitUntil: 'networkidle'` never settles.** socket.io holds a connection open
  on every surface with presence in it. Use `domcontentloaded` and wait for the
  element you need. The driver's `open()` already does.
- **Every MUI multiline input has a second, hidden textarea** beside the real one
  (it measures the height), so `locator('textarea')` resolves to two and
  Playwright refuses in strict mode. `textarea:not([aria-hidden="true"])` — the
  driver exports this as `composer(page)`.
- **The sign-in card has two controls called "Sign in"** — the form's submit and
  the provider card's icon button. Scope to `locator('form')`.
- **A refused sign-in leaves you on a perfectly normal guest session.** The page
  renders, the list draws, and the only tell is a 401 in the console. The driver
  asserts against `/serverXR/api/auth/session` after signing in and throws rather
  than walking a whole flow as nobody.
- **Usernames are 3–32 characters.** `bo` is rejected with a message about the
  rule, not about the length; `bob` is fine.
- **`CLIENT_DIR` in `serverXR/.env.local` breaks `npm run test:server-contracts`**
  with "does not serve an SPA" — the suite's "CLIENT_DIR unset" case starts a
  server that is serving one. Run it as `CLIENT_DIR= npm run test:server-contracts`.
- **Gated surfaces need the right space, not just an account.** `/chat/main`,
  the editor and Raw all check scope; an account with `spaces: []` gets the same
  door card a guest does.

## Troubleshooting

- **`Error: ENOENT ... stat '<repo>/serverXR/.env'`, and `[dev-stack] ServerXR
  exited early (1)`**: the env files do not exist. `cp serverXR/.env.example
  serverXR/.env && touch serverXR/.env.local`.
- **`could not sign in as "x"`** from the driver: no such account, or it has a
  different password. `driver.mjs account x --spaces main` makes it.
- **`registered but not in <path>/di.db`**: the running server is using a
  different data root than the driver found. Check `DATA_ROOT` in
  `serverXR/.env.local` — it overrides `.env` — and restart the server if you
  changed it.
- **A page renders but every list is empty, console shows 401s**: the session is
  a guest. See the sign-in gotcha above.
