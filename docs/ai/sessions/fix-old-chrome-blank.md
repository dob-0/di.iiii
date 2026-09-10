## 2026-09-10 — every page was black on any Chrome older than 122

- Found while running the studio chat's APK on an emulator: a Pixel 6 with
  Chrome 113 rendered NOTHING. `ReferenceError: Iterator is not defined`,
  `#root` empty. Not the chat's fault and not staging's — `/`, `/spaces` and
  **di-studio.xyz itself** all came back the same way.
- pdf.js ships a polyfill for `Iterator.prototype.join` written as
  `typeof Iterator.prototype.join !== 'function' && (…)`, which dereferences the
  `Iterator` global before deciding whether it exists. `Iterator` is Chrome 122
  (Feb 2024) and Safari 18.4. pdf.js is in the vendor chunk, so it runs on every
  page rather than only where a PDF is imported, and it throws before React
  mounts. This has been true since pdfjs went to 5 on 2026-09-06.
- Six lines in the head of `src/index.html`, before the module: if `Iterator` is
  missing, define it with the real %IteratorPrototype% — which is ancient and
  reachable — so the polyfill patches the object an iterator actually looks at.
- The first draft of that shim did nothing at all, because a `function Iterator`
  declaration hoists a LOCAL binding and `typeof Iterator` then reads it instead
  of the global. `src/oldBrowserFloor.test.js` caught it: it runs pdf.js's own
  line in a realm with the global deleted, and fails without the shim.
- **Seen**: the same emulator, same Chrome 113, against a build carrying the fix
  — the page renders, `#root` has children, no page errors, and the chat's door
  card reads correctly. Screenshot looked at.
- Untouched deliberately: pdf.js is not pinned back, and nothing else is
  polyfilled. This is one missing global, restored where the library expects it.
