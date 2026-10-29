# A terminal may ask to open a door; the owner's tap decides

Date: 2026-10-30 · Ledger N1544 · Status: proposed, waiting for the owner's look · Design:
`docs/ai/agent-door-on-request.md`.

## The owner's words

> "just you can push dev" · "dev to main what the point" · "i dont want to do nothing do it your self"
> · "so do that" · "i want to both now do and build" (2026-10-30, 02:5x-03:0x)

## The problem

A terminal login (`dii_cli_…`) refuses every `reach: 'public'` route with `403 not_through_cli`
(`serverXR/src/cliTokenGate.js`; `SPEC_agent_door.md` §6 "never public"). So an agent working for the
owner in a terminal cannot make a join code, make a space public or join a followed space, and the
owner has to leave the terminal for the browser for each one.

## The decision

- A terminal login may **ask** for a public move the catalogue names (`cliOnRequest`): phase 1 is
  `spaces.joinCode`, `spaces.publish` (`isPublic` / `publishedProjectId` only) and `follows.join`.
- The ask becomes a pending action of the existing approval gate (`requireApproval`, ttl 10 minutes,
  the intent hash binding args, actor and terminal), the owner gets one Allow / Refuse message in his
  console, and only a tap runs it, reauthorised (token still live, person still allowed).
- Deleting, keys, accounts, sign-in, approvals, ownership, platform settings, the wifi door and
  domains stay refused, with or without a tap.
- No standing grant in phase 1.
- One switch, `CLI_DOOR_ON_REQUEST`, default off; off is today's behaviour byte for byte.

## Why this and not the alternatives

- **Keep §6 as it was:** the safe default, but the owner has decided against it for his own work.
- **Let the key do it with a flag:** exactly what §6 was written against; a leaked file would open
  doors with nobody asked.
- **Replay the stored HTTP request after the tap:** refused by the approval gate's own design
  (approvalGate.js header): it would need to forge the absent person's session. Semantic intent with
  reauthorisation is used instead.
- **A per-space standing grant:** convenient, but a copied key opens doors for its whole window with
  no human in the loop. Left for a separate decision, in a narrow form, if wanted.

Method: the gate is the pattern of a human approval step in a two-person rule, as the approval gate
already does for admin writes (di-bo approval plan); the poll is the OAuth device grant's (RFC 8628)
polling, which `di login` already uses.

## What changes, what is owed

Code: none in this decision. Owed, in order: serverXR PR behind the flag, di-bo PR (Allow / Refuse
words), rehearsal on r-di, the Mac, the flag on dev, one real request tapped on the owner's phone.
Owed separately: approval by the person in their own browser (not only the owner's console), and the
follower side on an install with no console.
