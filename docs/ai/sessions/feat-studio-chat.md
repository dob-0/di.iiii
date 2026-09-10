## 2026-09-10 — the space chat gets its own address, and a phone can install it

- `/chat` is the studio's room and `/{space}/chat` is any other space's: the space
  chat on a page of its own, with nothing else on it. Until now that room could
  only be reached by loading Raw or the toybox and opening a panel inside it.
- Nothing was added to the transport. `spaceChatStore.js` already persisted the
  room, replayed it on join, capped it at 500 characters and let an admin erase a
  line; `useProjectPresence` already carried it. The new `useSpaceChat` exists
  only because that hook refuses to connect without a `projectId`, and a chat
  page has no project.
- Verified by looking, on the BUILT app served by serverXR (not the dev server):
  two browsers signed into the same space, desk and phone viewport, each saw the
  other's line, and a reload brought the transcript back from the database.
- The chat is behind the gate on its own space, and the gate learned a second
  sentence: `outOfScopeMessage`. Its default is the editor's wording, unchanged
  for every existing caller — "you can view this space but not edit it" is the
  wrong refusal to hand somebody standing at a chat room.
- Installable: `public/chat/manifest.webmanifest` and a network-first
  `public/chat-sw.js` scoped to `/chat`, both claimed by the chat surface alone
  and never site-wide — site-wide they would offer to install the platform under
  the room's name and put a cache in front of the editor.
- An Android APK wraps the same address (`xyz.distudio.chat`, signed, built with
  bubblewrap as a Trusted Web Activity). Recipe, toolchain and traps:
  `docs/deploy/STUDIO_CHAT_APK.md`. `public/.well-known/assetlinks.json` carries
  its fingerprint, and serverXR grew a route for that one file because
  `express.static` ignores any path with a dot segment.
- `--ui-bg` was used by AuthGate, ReservedAddressCard and now the chat, and was
  declared nowhere: those full-screen grounds painted transparent. Declared in
  `base.css`.
- **Not done, and it is the whole point:** the APK targets `di-studio.xyz`, where
  `/chat` does not exist until this lands on prod. Until then the app opens a
  not-found card. Promotion past staging is the owner's word.
- **Not seen:** the APK has not been run. No phone was attached, and the emulator
  image was still downloading.

## 2026-09-10 — the icons were standing in the room's doorway

- `public/chat/` — the manifest and the three icons — is a directory with the
  same name as the ROUTE. That shadows it: nginx's `try_files $uri $uri/` reaches
  for the directory before the SPA fallback, and `express.static` answers the bare
  `/chat` with a redirect to `/chat/`. Renamed to `public/chat-app/`.
- The redirect is also why the service worker could not replay the page with the
  network off: a redirected response may not satisfy a navigation, so an offline
  reload died as `ERR_FAILED` with the cache full and correct.
- Guard: `reservedSegments.test.js` now fails if any directory in `public/` is
  also an app route — the fifth claimant on a URL segment, and the one nothing
  had ever checked. `wcc` stays the one hand-held exception it always was.
- Two more things the worker was getting wrong, both found by looking at the
  offline page rather than at the code: it cached only the HTML (the browser
  fetches this build's JS and CSS before the worker exists, so they never pass a
  fetch handler — the page rendered blank white), and `caches.match` was missing
  everything it did hold because the server sends `Vary: Accept-Encoding`. The
  page now hands the worker its own resource list, and matching ignores Vary.
- **Seen**: with the network cut, the app loads and says "Backend unavailable —
  Retry" in its own type. It does not show the conversation, and should not:
  chat lines are never cached, because a cached copy of a conversation can be
  wrong about who said what. The worker's header says exactly this now; it used
  to claim the room came back.
