# fix/kit-pictures-local

## 2026-10-26 — The Kit's pictures reach the local pack

- 2026-10-26 (owner: "fix all" in the di.iiii space; found by the /tools check, report tools-room.md part C): all 21 pictures
  of the Kit page are 404 on the own di (dev is fine), because `public/kit` is not in the local pack's include-list
  (`PROGRAM_PUBLIC_DIRS`, src/works/buildProfile.js). Cause, evidence and the ruled-out causes: docs/ai/known-fixes.md,
  entry of the same date.
- Fix: `'kit'` joins the list (22 files, 205 KB). The list is still an include-list; nothing else was widened.
- Guard (src/works/localProfile.test.js): every Kit card picture is under a carried entry (plain and slim local builds),
  and every top-level entry of public/ is carried or named as left out with its reason. A new folder in public/ now fails
  the test until someone decides, which is how `kit` would have been caught on 2026-09-28. It does not prove that every
  file a page names is carried: the chat pages name `chat-app/` and `chat-sw.js`, /for-apps names `robots.txt` and
  `llms.txt`, and all four are left out (below).
- Checked the rest of public/ the same way (curl of the own di against dev, and who names it in the code):
  - `chat-app/`, `chat-sw.js`: named by the chat pages once someone is signed in; own di 404, dev 200. NOT changed: it is
    a behaviour change (a service worker starts on installs), `chat-sw.js` is a file where the list holds directories
    only (scripts/packProfile.test.js), and the sign-in wall kept the effect from being seen. Listed OWED in the test.
  - `robots.txt`, `llms.txt`: linked from /for-apps; every di.iiii address in them is https://diiii.xyz/ (llms.txt also
    links the source on github.com, and both hold the placeholder https://example.com/bot). Left out. On an install
    those two links on /for-apps answer 404; hiding them there is a page change nobody asked for.
  - `og/`, `.well-known/`, `serverXR/`, `.htaccess`, the two `*-default-scene.php`: hosting furniture; no page in src/
    names `.htaccess`, `serve-asset.php` or the two php shims (grep, 2026-10-26). Left out, each with its reason in the test.
- Tests: `npx vitest run src/works/localProfile.test.js` red on origin/dev's list (3 failed, 11 passed), green on this
  one (14 passed); with scripts/packProfile.test.js, src/utils/reservedSegments.test.js, src/kit and src/works: 9 files,
  76 passed, 1 skipped (the skip is the slim-size check, which needs a dist/).
- Pack proof: the real `di-local-public-dir` step run into a temp directory (script beside the report,
  agent-reports-2026-10-26/fix-all/kit-build/pack-public.mjs): 0 of 21 pictures on origin/dev's list, 21 of 21 on this one.
- Not done: no full `vite build`, no pack and no `di update --from` (the real-surface check needs an installed pack:
  `curl -sI http://diiii.localhost/kit/walk.webp` must then say 200 `image/webp`, and `/tools` must show no broken picture).
