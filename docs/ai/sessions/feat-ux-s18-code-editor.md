# Session: feat/ux-s18-code-editor (UX wave 3, slice S18, finding F018)

## What the change replaces, and where the old stays (owner rule 2026-10-29: nothing is ever lost)
- Replaces: the Code window's bare `<textarea>` (CodeEditorArea.jsx, system `monospace` 12 px, no name, no line numbers/colours/find, Tab left the box).
- Old stays as a **mode**: the same textarea (`PlainCodeArea`) is chosen with "Use a plain text box" under the editor (remembered in localStorage `di.codeEditor.plain`; "Use the code editor" goes back). It is also shown while the editor loads and if the editor fails to load (error boundary). The old code is in git history of origin/dev 8f20185c1.
- The commit path (400 ms idle, blur, unmount -> `onCommit`) is the same code for both, `codeBuffer.js`.
- The default stays the new editor only because slice S18 in the plan says so; the owner can flip the default.

## Dependency provenance (rule: provenance and law) — read from node_modules/<pkg>/package.json and LICENSE, 2026-10-29
All "license": "MIT", LICENSE first line "MIT License" (copyright Marijn Haverbeke and others):
@codemirror/state 6.7.6 · view 6.43.15 · commands 6.11.1 · language 6.13.1 · search 6.7.2 · lang-javascript 6.2.5 · lang-html 6.4.12 · lang-css 6.3.1 (all exact in package.json/package-lock.json). `@lezer/highlight` 1.2.5 was already in the tree (now a direct dependency, exact). Transitive: lezer parsers, style-mod, w3c-keyname, crelt (from the lockfile; not individually read here).
Method source: CodeMirror 6 reference (codemirror.net/docs/ref) — tab-focus mode (`temporarilySetTabFocusMode`) is the library's own WCAG answer.

## Build size (`npm run build`, same machine, before = origin/dev with the deps installed but unused)
- Before: vendor 791.10 kB (gzip 240.01), 304 js files, 7 974 833 bytes JS total.
- After: vendor 791.10 kB unchanged (same hash); new `codemirror-vendor` 493.69 kB (gzip 171.60) + CodeMirrorBox 2.34 kB (gzip 1.19) + css 0.62 kB; 307 js files. Not in index.html: loads only when the Code window opens an editor.
- Before adding the `manualChunks` entry the same code made vendor 1 285.81 kB (+495 kB on every route) — caught and fixed.

## Not done / owed
- The 680 KB cinema-house file in a browser, desktop and phone, before/after pictures: not taken by this builder (see S18-work.json notes).
- "Whole page sent at each pause" is S31.
