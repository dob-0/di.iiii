# The di.iiii SDK

Everything di.iiii can be told to do, written once, and handed out three ways:

| face | who uses it | how |
|---|---|---|
| a library | a project, a script, you | `import { connect } from 'di.iiii/sdk'` |
| an MCP server | Claude, or any agent that speaks MCP | `di mcp`, or `node sdk/mcp.mjs` |
| the `di` command | you, typing | *not yet on this core — see Honest limits* |

One list of moves, so a rule learned once holds everywhere.

## Why it exists

Three projects in this studio each hand-rolled their own way to talk to
di.iiii — 241, 103 and 101 lines doing the same eight moves. All three
re-derived the same traps, two of them got a token by reading
`/home/nooo/di.iiii/serverXR/.env.local` by absolute path, and the rules that
had been learned the hard way lived as comments in one of them.

An agent calling the same API knew none of it.

## Using it

```js
import { connect } from './sdk/index.js'

const di = await connect({ tier: 'local' })      // 'local' | 'dev' | 'prod', or base: 'https://…'

await di.run('space.list')
await di.run('space.ensure', { space: 'library', label: 'Library' })
await di.run('project.ensure', { space: 'library', project: 'di-library' })
await di.run('project.writeHtml', { project: 'di-library', html })
await di.run('space.frontDoor', { space: 'library', project: 'di-library' })
```

### Tokens

`DI_TOKEN`, then `DI_TOKEN_LOCAL` / `DI_TOKEN_DEV` / `DI_TOKEN_PROD`, then
`~/.config/di/credentials.json`. The dev tier (dev.diiii.xyz) is `dev`; the old
`staging` name is refused. **Never a repository.** A local install on
loopback needs no token at all, because it runs with auth off; anything
reachable by another machine must still prove who it is.

## Safety: reach

Every move declares how far it reaches.

| reach | means | what happens |
|---|---|---|
| `read` | shows nothing to anyone new | runs |
| `private` | writes where you can already reach | runs |
| `public` | **opens a door** — a new audience can see, edit or reach something | **refused unless confirmed** |

```js
const di = await connect({
    tier: 'prod',
    confirm: async (intent) => {
        console.log(intent.opens)     // "EVERYONE on the internet could read the space …"
        return await askTheHuman()    // only `true` proceeds
    }
})
```

**No `confirm` means public moves are refused, not performed.** That default is
the most important line in this SDK. An agent handed a token, with nobody
watching, must not be able to publish by omission — opting *in* is a decision
someone makes, opting *out* must never be something they forget. Anything other
than exactly `true` refuses, and a refusal never touches the network.

`di.explain('space.invite', { space: 'library', label: 'Anna' })` tells you what
a call would open without doing it.

Reach can depend on the arguments: `space.ensure` is private, and
`space.ensure({ isPublic: true })` is public.

Closing a door — `space.makePrivate` — never asks. Only opening one does.

## The traps, encoded

Each of these cost real damage before it was a line of code.

- **A space id comes from the LABEL**, never from the id you send. `space.ensure`
  checks what the server named it and refuses the mismatch, instead of leaving
  you to 404 against the name you asked for.
- **Asset ids are per-server.** The asset cache key carries the host, and one
  `HEAD` proves a cached run points at files *this* server has. Without it, a
  prod run reads the dev tier's cache, uploads nothing, and publishes a page that
  loads perfectly with every PDF dead.
- **`PUT` is last-write-wins and normalises silently.** `project.writeHtml`
  reads the live document, merges, writes, reads it back, and compares byte for
  byte. A 200 is not evidence.
- **`202` is not success.** It means di.iiii's approval gate is armed and the
  change is *queued, not applied*. It throws `ApprovalPending`.
- **A space made by a token belongs to nobody.** `canAccessSpace` ignores
  `ownerUserId`, so without an invite or a scope entry even the person who asked
  for it gets "Access restricted". `space.ensure` says so as it happens.
- **Spaces delete themselves.** `pruneSpaces` removes any non-permanent space
  untouched for 30 days — and a *read* is not a touch. Everything is born
  `permanent: true`.

## The agent face

```
claude mcp add di -- node /path/to/di.iiii/sdk/mcp.mjs --tier local
```

or, from an install, `di mcp`. Spec: `docs/architecture/SPEC_agent_door.md`.

**Four tools, whatever the server can do:**

| tool | does |
|---|---|
| `di_find` | search by words; nothing asked = an overview by area |
| `di_describe` | one name in full: inputs, reach, any trap, a call to fill in |
| `di_call` | run one name |
| `di_run` | up to 20 calls in order in one go; `"${step.body.id}"` feeds one into the next; stops at the first failure and says what ran |

Names are the moves above (`space.list`, ranked first, because they carry the
traps) and every route the server's own catalogue opens to agents
(`GET /api/catalogue`, built in `serverXR/src/catalogue/`). The door reads the
catalogue from the server it talks to, so it can never describe a different
one. A route cannot land without a catalogue entry —
`serverXR/src/catalogueContracts.test.js` walks the live router and fails.

It runs on the official SDK, `@modelcontextprotocol/server` (pinned exact in
`package.json` and `serverXR/package.json`; an install resolves it from
`serverXR/node_modules`), serving MCP 2026-07-28 and the 2025-era handshake.

**The server is the protection** — it refuses what the token may not do.
On top of it, public moves are refused outright unless the person who launched
the server set `DI_MCP_ALLOW_PUBLIC=1`, and even then each call must carry
`confirm: true`; the refusal tells the agent to put it to the person in words.
An unattended agent cannot publish, mint an access link or delete a space.

**Measured (2026-09-24, `sdk/evals/RESULTS.md`):** before any question, 4 tools /
3,685 bytes covering 17 moves and 55 routes (the old server: 17 tools / 7,088
bytes, 17 moves), and it does not grow with the routes. On 10 read-only
questions: 9/10 correct against the old server's 6/10, 75 tool calls against 89,
$1.05 against $1.49, half the time. One run each — variance not measured.

**Use `pick` on anything big.** Without it the same questions cost 209 calls:
the model re-read scene documents past the answer cap in pieces.

## Honest limits

- **There are no per-person agent keys yet.** Today a token is one of the
  server's fixed keys (admin / editor / viewer) or a per-space sync key. Letting
  other people bring their own agent safely is phase 2 of the spec — keys that
  act as their person and never above, enforced by serverXR.
- **Reach is per route, not per argument.** `PATCH /api/spaces/:spaceId` is
  `public` because it CAN open a door (isPublic, owner, trusted), so a plain
  label change asks too. Coarse on the safe side, on purpose.
- **Route inputs are described by hand** in `serverXR/src/catalogue/entries/`.
  The contract test proves every route has an entry, not that each schema is
  complete; the server still validates every request itself.
- **`di` does not run on this core yet.** It predates the SDK and moving it is
  its own change. Until then "one core, three faces" is true of two.
- **`DI_MCP_ALLOW_PUBLIC=1` trusts the agent to ask.** Once it is on, nothing
  stops a model calling again with `confirm: true` by itself; what it buys is
  that the intent is stated in the transcript and the host's own permission
  prompt still stands. The hard guarantee is the default: off.
- **Reach is declared, not derived.** A new move with the wrong `reach` is a new
  hole. `sdk/sdk.test.js` checks the ones that exist; adding a move means
  deciding what it opens.

## What is "public" here

Section 4 of `di-atlas/PUBLIC_PRIVATE.md` — the estate's own map of what is
already open, what still is, and every move that opens a door. `reach` is that
document turned into code.
