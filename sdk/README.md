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

const di = await connect({ tier: 'local' })      // 'local' | 'staging' | 'prod', or base: 'https://…'

await di.run('space.list')
await di.run('space.ensure', { space: 'library', label: 'Library' })
await di.run('project.ensure', { space: 'library', project: 'di-library' })
await di.run('project.writeHtml', { project: 'di-library', html })
await di.run('space.frontDoor', { space: 'library', project: 'di-library' })
```

### Tokens

`DI_TOKEN`, then `DI_TOKEN_LOCAL` / `DI_TOKEN_STAGING` / `DI_TOKEN_PROD`, then
`~/.config/di/credentials.json`. **Never a repository.** A local install on
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
  prod run reads staging's cache, uploads nothing, and publishes a page that
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

or, from an install, `di mcp`.

Every move becomes a tool (`space.list` → `space_list`), read-only ones marked
as such, and any move that opens a door says so in its own description.

**Public moves are refused outright** unless the person who launched the server
set `DI_MCP_ALLOW_PUBLIC=1`. Even then each call must carry `confirm: true`, and
the refusal text tells the agent to put it to the person in words first. The
decision to let an agent publish is made once, by a human, *outside* the
conversation that would ask for it — an unattended agent cannot publish, cannot
mint an access link, and cannot delete a space.

It is JSON-RPC over stdio, written by hand with no dependency, because this
ships inside a 3.1 MB artifact meant to work at a venue with no network.

## Honest limits

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
