## Every page has its own title and heading (UX S19, F125)
- New `src/hooks/pageTitles.js`: one route -> tab-title table; Studio (spaces, projects, project, director), chat, tools, Admin use it through `useDocumentTitle`.
- Studio project view: visually hidden h1 (project name) and a `<main>` (display: contents, no layout change). Chat home: h1 + main. Tools and Admin already had an h1.
- Replaces: the inherited index.html title on those routes. Kept: index.html default for the landing/unknown routes (mode: fallback).
- Tests: `pageTitles.test.js`; not tested: browser tab strip pictures, axe, S13 message layer (not on dev), Make page title.
- Review (2026-10-29): hub/spaces/director wrapped in a `<main>` by StudioApp; project h1 moved inside its main. 20 tests, 9 fail on old sources.
- Repair (2026-10-29): the StudioApp wrapper made two mains on /spaces and a hub (SpaceHub, StudioHub own one). The wrapper is gone; the director renders its own `<main>`. Guards: one-main counts in SpaceHub/StudioHub/StudioCodeSpaceDirector tests + a StudioApp source check; the director and source checks fail on the pre-repair code.
