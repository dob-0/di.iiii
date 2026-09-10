## 2026-09-11 — the app opens on a list, not inside one room

The owner installed `iiii`, opened it, and said the thing that mattered:
*"still limited when i open app it just the same ui where is the conntacts
create new chat and etc."* He was right. Everything built so far was one room
and a set of tools for being inside it. There was no way to see another room, no
way to start a conversation with somebody who was not standing in that room at
that moment, and no way back out. One room is not a place with rooms in it.

- **`/chat` is now the list** — rooms first, private conversations under them,
  each with its last line, the time, and a dot when something arrived since this
  device last had it open. `/chat/{space}` is the room; `/{space}/chat` still
  works because links to it exist.
- **Rooms moved UNDER `/chat` for a concrete reason:** the service worker's scope
  is `/chat`, and a scope does not cover `/main/chat`. The room's canonical
  address had to be inside the installed app's own scope or the page people
  actually use has no worker on it.
- **`GET /api/chat/rooms`** (`serverXR/src/routes/chatRoutes.js`) — one call
  draws the whole list. Opening ten sockets to render ten rows is how a chat app
  becomes slow on a phone. Scope is asked per space via `canAccessSpace` rather
  than read off the session's array, so an unrestricted account is right without
  every space being written against it. Sandboxes are never listed.
- **`GET /api/dm/people`** — the "new chat" picker. The SAME rule the key lookup
  already enforces: people you share a space with. Not an address book, and not
  a directory of everyone who ever signed up — that is a different product. Each
  row says whether that person has ever opened a private conversation, because a
  name that leads to a spinner is worse than a name marked as not ready.
- **The list of private conversations is assembled in the BROWSER**
  (`src/chat/privateChatIndex.js`), from the histories that are already there
  plus a local map of names. A server-side list of who talks to whom is the
  metadata end-to-end encryption is largely for: the words would stay sealed and
  di.iiii would still know that these two people spoke, when, and how often.
  Building that to draw a nicer list would give away the thing being protected.
  The cost is stated in the interface: clearing this browser clears the list.
- **Read marks are local too** — "unread" means something arrived since THIS
  device last had the room open. A server that knew when you read something is a
  server that knows when you are awake.
- The room grew a back arrow. It used to BE the app, so there was nowhere to go
  back to; a door that only opens inwards is a room you are stuck in.
- The staging APK stopped calling itself "studio chat".

**Seen, not assumed:** two accounts, two browsers, desktop and Pixel 7 — the
list with a room's last line and its unread dot, the ✚ picker listing five real
people with their reachability, tapping a room and coming back, and a private
conversation appearing under PRIVATE with the lock, the name and its last words
after being held in that same browser.

**Not done:** no push notification, so a message that arrives while the app is
closed is read when it is next opened. That is the next honest gap.
