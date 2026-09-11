## 2026-09-11 — a space has two rooms, and an admin can empty either

The owner asked for *"normal chat and admin chat clear"*. So: every space now has
the room everybody in it can open and a **staff room** only an admin can, and an
admin can **empty** either one.

- **One machinery, one key.** Both rooms are the same store, the same tools, the
  same caps, separated by `chatStoreKey()` — `main` and `main#staff`. Two chat
  implementations is how the two slowly stop behaving the same way. The `#` is
  what makes the key unreachable by naming a space: a space id is
  `/^[a-z0-9-]{3,48}$/`, so no space can ever be called `main#staff`.
- **Not hidden — absent.** `chatSocketRoom()` puts the two in different socket
  rooms, so a staff line is never delivered to a socket with no business
  receiving it. The interface hiding a tab would not be a private room.
- **Emptying a room** is the most destructive thing this wire carries: it takes
  everybody's words, not just the asker's, and there is no undo anywhere in the
  stack. Admin only, announced to the whole room rather than done quietly, and
  the interface makes you type the space's own name first. That last part is not
  security — a crafted client skips it — it is there so nobody empties a room by
  tapping the wrong line of a menu.
- The list shows a staff row per space, for admins only. A row that answers
  "the staff room is for admins" when tapped is worse than no row.

**The bug this found, and it is the kind that only shows up in two browsers:**
the surface demoted an admin out of the staff room *before the server had
answered*, because `canModerate` starts `false` and "not asked yet" looked
exactly like "no". The socket then joined the open channel, and a line written
in what looked like the staff room went where everybody could read it. Found by
reading the database after the run, not by any test. Fixed by tracking whether
the answer has arrived separately from what it was; in `known-fixes.md` as a
general rule about permission flags in flight.

**Seen, not assumed:** the admin's list with staff rows, the staff room with its
own history and the Room/Staff switch, a non-admin who asks for `?c=staff` by
name landing in the open room instead, the confirm dialog refusing to arm until
the space's name is typed, and — after emptying the staff room — 0 rows under
`main#staff` with the open room's 20 lines untouched.
