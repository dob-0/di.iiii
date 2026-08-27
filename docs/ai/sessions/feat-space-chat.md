## 2026-08-26 — chat that reaches the other rooms, not just this one

Project chat has always been real, and always been per-project: a message
reaches whoever is standing in the same project and nobody else. At the Dilijan
camp that is exactly the wrong shape — each child works alone in a room of their
own, so the project channel is a room with one person in it, and the four people
they mean when they say "talk" are each in a different room.

This adds a **space** channel beside the project one. Two rooms, one window.

- `serverXR/src/spaceChatStore.js` + `socketHandlers.js`: space-scoped chat,
  space membership checked the same way the scene socket already checks it.
  Moderation (remove a message) is there for whoever holds the space.
- `useProjectPresence` grows `spaceMessages` / `sendSpaceChatMessage`, opt-in on
  a `spaceId` argument — a caller that passes none keeps exactly the behaviour it
  had, which is what keeps every existing surface byte-identical.
- `ChatPanelWindow` gains the two tabs. Every string it says out loud is now a
  prop with its old value as the default, so Raw is unchanged and a bilingual
  surface can say them in its own language.

## 2026-08-27 — and the children can reach it

Merged `dev` in (the toybox landed there in the meantime) and wired the space
channel through to `src/make/` as well, because a chat the kids cannot open is
not the chat this was built for. In the toybox the two tabs read **ԲՈԼՈՐԸ** and
**ԱՅՍՏԵՂ** — everyone, and here. Not the space id: a ten-year-old does not know
they are standing in `dilijan`, they know the other four are somewhere else and
they want to reach them. One unread badge over the single ԽՈՍԵԼ button counts
both rooms, because a child has one talk button, not two inboxes.

The conflict in `ChatPanelWindow` was real and both sides were right — the space
branch wanted the wording to describe the room, the toybox wanted the wording to
be Armenian. Resolved by keeping both: the project room's three strings stay
caller-supplied, and the space room now has its own three, defaulting to what
Raw has always said.

Not verified: two children in two different rooms on real phones over camp wifi.
Two browser contexts on one machine is what was actually tested.
