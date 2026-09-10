## 2026-09-11 — the room got the six tools a room actually uses

The owner asked for the chat's UI and UX, naming the tools he wanted — *"pin,
sent, share"* — and how to choose the rest: *"look to what telegram have take
the good one's not the fancy things"*. So the list was cut before it was built.

**In:** reply, pin, copy (text or a link to one message), share the room,
delete, "someone is typing", and a way back down that says how much you missed.
**Out, deliberately:** reactions, forwarding, stickers, threads, read receipts,
message search, folders, edit-after-send. Each of them is a second mental model
for a room that has ten people in it.

- **Reply** — `space_chat_lines` grew `reply_to_id/name/text`. The quote is a
  COPY, not a foreign key: an admin can erase the original, and an answer that
  then reads as an answer to nothing is worse than one that still shows what it
  answered. Capped at 160 characters, or a chain of replies carries the whole
  conversation inside its last line. In the private p2p chat the quote rides
  INSIDE the sealed body — a reply in the clear would put the answered words
  back on the wire, which is the one thing that file exists to prevent.
- **Pin** — one per room (`space_chat_pins`), not a list: a stack of pins is
  read by nobody, which is the same as having none. Stored as an id and resolved
  on read, so removing the message takes the pin with it rather than leaving a
  bar over nothing. Only accounts may pin; a guest is a browser that will be
  gone tomorrow.
- **Delete your own line** — until now only an admin could remove anything.
  `space_chat_lines.account_id` is stamped by the SERVER from the session when
  the line is written, and `wroteSpaceChatLine()` (exported and unit-tested, so
  the rule can be read without a server) is what "my own" means. A guest falls
  back to the label its socket joined with — a courtesy, not a wall, and stated
  as such in the code — but a line written by an account is never removable by a
  guest, however that guest labels itself.
- **Typing** — relayed to whoever is in the room at this instant and written
  down nowhere. Throttled on both sides; expired by a sweep on the client, since
  there is no "stopped typing" event and there should not be one.
- **Copy link** — `/chat?m=<id>` scrolls to the message, marks it for a moment
  and drops the query so a reload does not do it again.
- **One trigger, two hands** — the ⋯ menu appears on hover with a mouse, is
  simply always there on a touch screen, and a long press anywhere on the line
  opens the same menu. A menu reachable only by aiming at a 20px target is a
  menu a thumb does not have.
- **A bug the two-browser run found:** the private conversation showed
  *"Waiting for them to open this conversation"* in red while it was plainly
  connected and carrying messages — the waiting text was set while looking for
  their key and nothing cleared it when the channel opened. In known-fixes.

**Seen, not assumed:** two signed-in accounts in two browser contexts, desktop
and Pixel 7 — messages both ways, a reply quoting the right line, the pinned bar,
the unread badge reading 3 while scrolled up, the ⋯ menu open on somebody else's
line (no Delete) and on my own (Delete), the line gone from BOTH browsers after
deleting it, and the private conversation with its fingerprint words and its
reply. Screenshots read, not just taken.

**Not done:** the wiki is untouched on purpose — the owner asked for the chat to
be kept out of the public wiki, and it stays out.
