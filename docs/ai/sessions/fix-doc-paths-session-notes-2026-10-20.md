## the doc-paths check refuses lasting docs that name a session note

- `scripts/check-doc-paths.mjs`: a document outside the notes folder that names one note file (not the folder, not its README) fails the check, even while the note exists, because `npm run land` deletes it at the fold.
- Why (ledger N843): the dev deploy of #971 failed at "Check AI docs" after the fold removed a note a lasting doc named; #974 fixed it by hand.
- Test: `scripts/check-doc-paths.session-notes.test.js` (runs the script on a temp tree): 4 cases.
