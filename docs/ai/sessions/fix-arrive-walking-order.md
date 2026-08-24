# Arrive-walking was stomped by the entryView reset (2026-08-24)

The arrive-walking flag (#262) consumed correctly but arrival stayed in view
mode. Cause: an existing effect resets navMode to 'orbit' whenever
`presentationState.entryView` changes — and on the document-ready commit it
always changes (undefined → authored value). It was declared after the consume
effect, so it ran after it and stomped the walk before paint.

Fix: the consume effect now lives BELOW the reset effect — same commit,
declaration order decides, walk wins. Regression test added: flag set →
mount → '← View mode' appears (the test that reproduced the stomp in jsdom).
