## 2026-09-11 — the ground under a private, end-to-end conversation

The owner asked for private p2p chats and, asked which kind, answered
*"actually peer to peer"*. So: the words travel browser to browser, sealed with
a key di.iiii has never seen. This is the half that had to be right first.

- `src/chat/p2pCrypto.js` — WebCrypto's own P-256 ECDH and AES-GCM, no
  dependency to audit. A fresh IV per message (a repeated IV under one key is
  not "weaker", it is broken), `decrypt` answers null rather than throwing
  because an unreadable message is an ordinary event on this wire, and
  `fingerprint()` gives two people six short words to read to each other — the
  only defence against a server that hands you the wrong key.
- **What it does NOT do, written in the file rather than left to be assumed:**
  no forward secrecy (one long-lived key per device), no authentication of the
  other person by itself, and no key escrow — a lost device is lost history.
  Do not describe this as Signal.
- `serverXR/src/dmDeviceStore.js` + `dm_devices` — a phone book of PUBLIC keys,
  one row per device, capped at twelve with the least-used dropped. A stolen
  copy of that table starts a conversation; it cannot read one.
- `routes/dmRoutes.js` — publish mine, list mine, forget mine, and look up
  somebody **I already share a space with**. A stranger and a person who does
  not exist get the same 404, so this cannot be used to ask whether an account
  exists.
- `socketHandlers.js` — `dm-signal` carries WebRTC offers, answers and ICE
  verbatim and stores nothing; `dm-here` marks a socket reachable, in memory
  only, because a fact about right now that outlives the connection is a lie.
  Guests may not signal (a disposable identity cannot be somebody you talk to),
  and an unreachable person is said out loud rather than dropped silently.
- **An hour lost to a stale process, now in known-fixes:** the routes returned
  404 while every check said they were registered. A dead `node --watch` was
  holding the port with pre-change code; each restart died on `EADDRINUSE`,
  logged it where nobody looked, and left the old server answering. Ask who is
  on the port before believing a route is missing.
- **Not done:** the client. No UI, no peer connection, no key stored in a
  browser yet — so nobody can hold a private conversation with this alone. That
  is the next piece, and the honest limits go in the interface with it: both
  people must be online at the same time, and a conversation cannot follow you
  to another device.

## 2026-09-11 — and it actually works, two browsers, no server between them

- `useP2PChat.js` + `PrivateChatSurface.jsx` + `/chat?with=<account>`. A query,
  not a path: a private conversation must never look like a shareable address.
- The way in is the room's own people — no directory, no search. The server
  refuses to introduce two people who share no space, so offering a name that
  could not be reached would be a door drawn on a wall. Guests do not appear:
  a guest is a browser, not somebody you can write to.
- **Seen**: two browsers, two accounts, a real message delivered. Then the claim
  checked rather than asserted — every table of the database and the whole
  server log searched for the sentence. Zero rows, zero lines.
- **The two-browser run caught a real flaw first**, which is the entire reason
  for running it: both sides connected and their fingerprints DID NOT MATCH. I
  was deriving the key from whichever device the registry listed first, and a
  person with an older row gets encrypted to a device that is not in the
  conversation. The key is now the one the peer PRESENTS on the connection —
  the registry says a person has a device, it does not say which one is on the
  other end. Matching words on both sides now.
- Second thing the run caught: whoever opens the conversation first arrives
  before the other has published a key. That is the ordinary case, and the first
  version treated it as a dead end. It waits and looks again, and starts the
  moment a signal proves they are there.
- `accountId` on space presence is stamped by the SERVER from the session, never
  taken from the client — `userId` is a label a browser made up for itself, and
  a private conversation can only be keyed on who somebody actually is.
- **The chat is off the public wiki**, at the owner's word: both articles cut.
  What is left is the Claude agent node, which is a different thing.
