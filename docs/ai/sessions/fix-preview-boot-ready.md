## 2026-09-06 — a space card frees its boot slot when it has painted, not when its HTML arrived

- The owner's `/spaces` left 8 of 12 cards black with a spinner minutes after opening. Reproduced
  exactly on a local guest session: 4 of 12 painted at 20s, and still 4 of 12 at 30s — the grid was
  not slow, it was stuck.
- Two causes, both measured, not reasoned about.
- **The stream.** Each preview iframe opened its own SSE connection to the project's event log and
  held it open. A browser gives one origin six sockets over HTTP/1.1, so the first six cards took
  every connection and cards seven to twelve could not fetch a single module for as long as anyone
  waited. That is why waiting longer never helped. A thumbnail no longer opens the stream (nor the
  two-second space-meta poll): it is a picture of the space as published, it re-reads on remount,
  and clicking it opens the real live surface with the stream and all.
- **The release.** The boot queue freed a card's slot on the iframe's `load` event, which for an SPA
  fires when the shell HTML arrives — before its chunks, its scene document or one asset. The queue
  drained in about a second and twelve full app instances booted at once anyway. The embedded app
  now posts `dii:preview-ready` to its host once the loading screen is gone and something has
  actually drawn, and only that frees the slot. A 12s backstop covers a page that never reports;
  unmount and scroll-away release as before. One watcher at app start covers every embeddable
  route — the published viewer, a code page, and the generic `<App />` a space without a project
  falls back to.
- **The queue's slot count was itself part of the problem.** Cards are the same app at different
  routes, so overlapping module requests coalesce; staggering them through a narrow queue makes
  each pay its own revalidation. Painted at 20s on the local dev server, twelve public spaces:
  2 slots → 6, 6 slots → 6, 12 slots → 12. The space grid now boots up to 12 at once (the cap is
  only a ceiling for a very long grid); the projection mapper keeps the tight default of 2, since
  its surfaces are different pages at full output resolution with nothing to share.
- Before/after, guest, 1440×900, DPR 1, counting cards whose loading screen was gone and whose
  canvas had drawn: dev server 4/12 → 12/12 at 20s (last card at 9.4s, all twelve within 10s);
  production build 12/12 by 3.5s.
- `MapSourceView` gets the same ready-release for PROJECT surfaces (our own page, so it can report).
  A URL surface is somebody else's page and keeps `load` — it has nothing else to offer.
- None of the twelve local spaces carries a cover image, so all twelve boot a live preview. A card
  with a working cover already shows the image and takes no boot slot; covers remain the way to make
  a grid instant rather than merely fast.
