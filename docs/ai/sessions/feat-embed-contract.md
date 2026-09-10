## 2026-09-11 — ?embed=1 becomes one contract every lane keeps

`?embed=1` had been honoured by exactly one surface, the published viewer, since
br_id_ge started passing it. `SurfaceBar` has carried an unused `hidden` prop
since it was written. This joins them, because a lane rendered inside a window
wearing a full-page navigation bar reads as a page stuffed into a hole.

- `src/utils/previewMode.js` — `isEmbedRequest(search)` beside `isPreviewRequest`,
  and the contract stated where the helper lives: embed hides NAVIGATION CHROME
  and nothing else. Never auth, never what is saved, never what is shown. A pane
  and a tab are the same program.
- `PublicProjectViewer` now calls the helper instead of parsing the query itself.
- Four lanes pass `hidden`: `/tools`, `/wiki`, `/<space>/projects`, and the blank
  node canvas. Those are all the lanes that actually draw a bar — StudioHub,
  RawHub and the chat surface do not render one, and adding bars to them would be
  adding chrome, not hiding it. They are named in the test file as owing the
  table a row if they ever grow one.
- `src/components/surfaceBar.embed.test.jsx` — table-driven over every lane that
  draws a bar plus the viewer, with and without the flag. The table IS the
  contract: a lane added later fails until it joins.
- `wikiContent.js` — one paragraph in "The bar", which already claimed the bar
  hid itself in an embedded window; that was only true of the viewer until now.

Looked at: `/tools` and `/wcc/projects` with and without the flag — one bar, then
none, content otherwise identical and no layout break.

This is what lets the next stage put a lane in a window without it looking like a
page in a hole.
