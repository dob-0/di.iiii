## 2026-09-06 — the space cards paint and the front door's view mode works, landed together

- #383: a thumbnail no longer holds its own event stream (six sockets per origin walled off
  every card past the sixth), the boot slot frees when the preview has PAINTED rather than
  when its HTML arrived, and space cards may boot twelve at once because the same app at
  twelve routes shares its module requests. Measured: 4 of 12 painted at 20 s before, 12 of
  12 after, all by 3.5 s in a production build.
- #384: the front door's "View mode" had switched the room OFF (pointer-events none, camera
  pinned). It now orbits, zooms and opens doors inside the same canvas — a controller swap,
  not a second renderer, so the room's WebGL context and the fallen page survive the toggle.
- Batched so neither goes BEHIND the other.
