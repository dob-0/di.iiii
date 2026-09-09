## 2026-09-10 — a room is silent until a visitor asks

Owner: *"can you fix the sounds in spaces.. there are playing sound inside space
make button and by def make it muted."*

He was on `/spaces`. Every card there is a live room in an iframe, and an
`audio` entity autoplays at volume 0.8 the moment its document resolves — so a
page that looks like a list of pictures was playing a room's soundtrack at him,
with no control anywhere. Cascade Club is the room that was singing; it is the
only one of the 22 spaces on the local tier that holds a sound at all.

The same fault made a room he actually opened unstoppable. `AudioObject` had no
notion of a visitor: every renderer passed `audioPaused={false}`, and
`VideoObject`'s `muted` was the author's setting and nothing else.

**It had to be a gate, not a boolean.** The visitor's surface and the author's
render through the SAME object components — a published room in orbit mode is
`StudioViewport`, the very one the editor draws with — so "which component am I
in" cannot answer "is a person authoring or visiting". So the page arms it:
`useVisitorSoundGate()` in `PublicProjectViewer` while it is mounted, and until
something arms it `isSoundAllowed()` is true and Studio and Raw behave exactly
as they did. An author placing a sound still hears it, which is the one thing
this change must not break.

- Off by default, remembered per viewer in `localStorage`, and the read is
  wrapped: private windows throw on ACCESS, not only on write, and silence is
  the right answer to not knowing.
- `?preview=1` — the card grid, the map's source view, the projection mapper's
  sources — is locked silent and cannot be turned on even by a stored yes from
  the real page. A thumbnail is a picture of a room, not the room.
- The button appears only where `roomHasSound(entities)`: an `audio` entity, or
  a `video` whose author unmuted it. A switch on a silent room is worse than no
  switch — it promises a sound that is not there.
- The arm is counted, not a flag, so a room inside a room does not disarm the
  gate on the first unmount.

**Seen, not assumed.** Packed `0.4.9-sound.2`, installed on the local tier, and
instrumented `AudioBufferSourceNode.start` in a headless browser:
`/cascade` opens with **zero** starts and a button reading "Sound off"; one
click gives `buffer-start` and "Sound on"; `/cascade?preview=1` gives zero
starts and no button. Screenshots of both states looked at.
