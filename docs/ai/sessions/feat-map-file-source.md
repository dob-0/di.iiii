## 2026-09-20 — a brought-in video/image retries itself instead of staying dead

Bug from the real two-machine rig: a file is chosen on machine A (the desk); the
op naming it reaches machine B (the wall, `/{space}/map/{project}/out`) within a
second, but the file's BYTES land a few seconds later over a separate transfer.
The wall's `<video src=…>`/`<img src=…>` requests the file the moment the op
arrives, gets a 404, and MediaError code 4 (or the image equivalent) is the end
of it — the element never asks again, and it stays dead until someone reloads
the whole page. Proven on the rig: reload makes it play; nothing else does. A
show machine runs unattended for hours, so nobody is there to reload it.

- Added `src/map/useRetryingMedia.js`: a small hook that schedules a retry
  after an `onError` — 2s, 4s, 8s, then holds at a 15s ceiling for as long as
  the surface stays mounted with that ref. `onLoaded` cancels the schedule.
  The ref changing resets it (a different file, not a retry of this one);
  unmount clears the pending timer.
- `src/map/MapSourceView.jsx`'s `image`/`video` branches became their own
  small components (`MapImageSource`/`MapVideoSource`) so the hook has a
  stable place to live — `MapSourceView` itself returns early for several
  other `kind`s before reaching them, and a hook can't sit behind a
  conditional return.
- The retry re-requests by remounting the element (`key={attempt}`), not by
  appending a cache-busting query string — the asset route is strict about
  query params, and the url is the content address, so it has to stay exactly
  what the manifest recorded.
- While retrying, nothing new is drawn: no placeholder, no text — just the
  same `<img>`/`<video>` MapSourceView already renders for a source that
  hasn't loaded yet. A wall going white, or gaining new text nobody put there,
  reads as a mapping mistake.
- Tests in `src/map/MapSourceView.test.jsx` use fake timers and drive it with
  `fireEvent.error`/`fireEvent.load`/`fireEvent.loadedData`, checking the DOM
  node's identity changes (or doesn't) at each delay boundary. Confirmed they
  fail without the fix (6 of the new tests, all the ones that assert a
  remount actually happens) before adding `useRetryingMedia`.
- Known-fixes entry added: `docs/ai/known-fixes.md`.
