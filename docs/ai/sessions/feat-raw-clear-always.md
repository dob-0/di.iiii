# feat/raw-clear-always — the desk is clear, always; the room is a window you size

Owner, 2026-08-20: "i can't change size … i mean window size of the room,
world. and i mean clear desk."

## What changed

- **The backdrop is retired.** The desk is flat paper in every scope, whatever
  stands in the document. The room is a view you open: the Scene window, the
  fullscreen Room, /out. (Third iteration of this dial in two days: always-on
  → only-with-content → never; the owner's verdict was the same each time.)
- **"Room" joined the palette commands** — with the wallpaper gone this is the
  zen route into the 3D view (the audit had flagged its absence as critical).
- **The room window could not be resized — two stacked causes, both fixed:**
  the handle was a 16px 4%-alpha square nobody could find, and the World
  panel's ⤢/● buttons sat exactly ON it (z-index 10 over 6) and swallowed the
  pointer. Now: a visible 22px corner glyph above all panel chrome, and the
  action cluster moved clear of the corner. Verified: drag grew 422×303 →
  651×462.
- **Inspector zeros bug**: a vec3/number whose value was never stored showed
  0/0/0 and a single-axis edit committed the zeros — editing one Scale axis
  flattened the node to nothing. Fields now carry the port's default
  (nodeInspectorSections) and PropertyInspector displays and merges against
  it.
- roomContent.js + tests deleted (nothing consumes it); dead overlay CSS
  removed; RawEditor backdrop tests rewritten to the always-clear contract,
  plus a palette-Room test.

## Verify

Seeded desk (Geo with cube + Scene window), read at DPR 2: desk flat with the
Geo present; Scene window shows the room; corner glyph visible; drag resizes;
Geo inspector reads Scale 1/1/1 with no stored scale.
