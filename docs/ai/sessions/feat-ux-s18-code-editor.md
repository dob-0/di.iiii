# Session: feat/ux-s18-code-editor (UX wave 3, slice S18, finding F018)

## What the change replaces, and where the old stays (owner rule 2026-10-29: nothing is ever lost)
- Replaces: the Code window's bare `<textarea>` (CodeEditorArea.jsx, system `monospace` 12 px, no name, no line numbers/colours/find, Tab left the box).
- Old stays as a **mode**: the same textarea (`PlainCodeArea`) is chosen with "Use a plain text box" under the editor (remembered in localStorage `di.codeEditor.plain`; "Use the code editor" goes back). It is also shown while the editor loads and if the editor fails to load (error boundary). The old code is in git history of origin/dev 8f20185c1.
- The commit path (400 ms idle, blur, unmount -> `onCommit`) is the same code for both, `codeBuffer.js`.
- The default stays the new editor only because slice S18 in the plan says so; the owner can flip the default.

## Dependency provenance (rule: provenance and law) — read from node_modules/<pkg>/package.json and LICENSE, 2026-10-29
All "license": "MIT", LICENSE first line "MIT License" (copyright Marijn Haverbeke and others):
@codemirror/state 6.7.6 · view 6.43.15 · commands 6.11.1 · language 6.13.1 · search 6.7.2 · lang-javascript 6.2.5 · lang-html 6.4.12 · lang-css 6.3.1 (all exact in package.json/package-lock.json). `@lezer/highlight` 1.2.5 is new too (not in origin/dev's lockfile; corrected by the reviewer: `git show origin/dev:package-lock.json | grep -c lezer` = 0), a direct dependency, exact, MIT. Transitive (read by the reviewer from each node_modules/<pkg>/package.json, "license": "MIT"): @lezer/common, lr, html, css, javascript; style-mod; w3c-keyname; crelt; @marijn/find-cluster-break.
Method source: CodeMirror 6 reference (codemirror.net/docs/ref) — tab-focus mode (`temporarilySetTabFocusMode`) is the library's own WCAG answer.

## Build size (`npm run build`, same machine, before = origin/dev with the deps installed but unused)
- Before: vendor 791.10 kB (gzip 240.01), 304 js files, 7 974 833 bytes JS total.
- After: vendor 791.10 kB unchanged (same hash); new `codemirror-vendor` 493.69 kB (gzip 171.60) + CodeMirrorBox 2.34 kB (gzip 1.19) + css 0.62 kB; 307 js files. Not in index.html: loads only when the Code window opens an editor.
- Before adding the `manualChunks` entry the same code made vendor 1 285.81 kB (+495 kB on every route) — caught and fixed.

## Review fixes (wave 3 reviewer)
- The editor is marked dark (`EditorView.theme({}, { dark: true })`): before it, CodeMirror's light base theme drew a black caret, a light grey find bar and a light selection on the dark studio.
- studio-code.css rules inside the editor name `.cm-editor` too, so they outweigh the library theme whatever loads last (mono font, gutters, active line).
- A change from outside (asset insert, sync) replaces only the part that differs, so the cursor stays where it was.
- "Use a plain text box" is at least 24 px tall (WCAG 2.5.8).

- Picture step fix: the editor has a height limit (70vh) and scrolls inside, so the find bar and "Use a plain text box" stay reachable with a 680 KB file; the line-number gutter is opaque.

## Not done / owed
- The 680 KB cinema-house file in a browser, desktop and phone, before/after pictures: not taken by this builder (see S18-work.json notes).
- "Whole page sent at each pause" is S31.

## Round 2 (picture step)
The editor now fills the free height of its own Code window (desktop) and Code sheet (phone) through a flex chain with min-height 0; the 70vh cap is gone. Nothing removed: the plain text box, find, opaque gutter stay.

Review of round 2: the Code window body and the phone Code sheet body keep their own scroll (no `overflow: hidden`), so the buttons and the library list under the editor are never clipped.
