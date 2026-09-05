## 2026-09-06 — harvest the platform fixes out of Emily's two open PRs

Neither of emilyanikoghosyan's open PRs can land as it stands: #254
(`feat/garage-sale`) puts a work in `src/`, and #180 (`feat/algovrithm-space`)
is a stale fork branch whose base is ~1080 commits behind dev, so merging it
would revert a great deal of dev. This branch takes the parts that are platform
fixes on their own and leaves the rest, so the two PRs can be answered honestly
rather than just closed.

**Taken from #180 (feat/algovrithm-space):**

- Form controls now inherit `font-family`. Buttons, inputs, selects and
  textareas do not inherit it from their parent — the UA stylesheet gives them
  their own — so every unstyled control was silently opting out of `--di-sans`.
- `src/styles/muiTheme.js`: MUI injects its own typography (Roboto) through
  emotion, which outranks plain stylesheet rules, so any surface rendering MUI
  without a ThemeProvider fell back to Roboto/Helvetica. Measured on a built
  preview of dev before changing anything: all seven landing-page buttons came
  back `Roboto, Helvetica, Arial, sans-serif` while the tagline beside them was
  Inter, and AuthGate/AccountButton had the same gap. Applied at AuthGate and
  LandingPage, not at the router, because RootApp lazy-loads MUI on purpose.
  StudioThemeProvider now reads the same token instead of its own copy of the
  Inter stack. Checked in a headless Chromium at 1440x900 DPR2 before and
  after: every button reports `--di-sans` now and no layout moved.
- The last two hardcoded `'Inter', 'SF Pro Text', …` stacks in `src/`
  (`styles/panels/base.css`) replaced by `var(--di-sans)`. Dev had already
  migrated the rest. No pixels change; the platform font is one edit again.

**Taken from #254 (feat/garage-sale):**

- One golden rule: a document-style page in this app has to be its own scroll
  container (`height: 100%; overflow-y: auto`), because `styles/base.css` pins
  `html, body, #root` to `position: fixed`. A page written with
  `min-height: 100vh` lays out, paints and screenshots correctly and simply
  cannot be scrolled — no error, no failing test. Verified against dev: the
  pin is still there and `pages/legal.css` is still the shape to copy. The
  rule is kept, the page that taught it is not.

**Left, and why:**

- The whole of `src/garage/` (the moving-sale page, its stroke marker font, its
  3D hero, its content file) and the `APP_PAGE_GARAGE` routing in
  `utils/spaceRouting.js` + `RootApp.jsx`, plus its wiki article. A work lives
  in its own repo and reaches the platform as a space; it does not get a folder
  in `src/`, and platform routing does not grow a constant for one poster.
  Nothing here is a defect — it is good work in the wrong repo.
- The Montserrat typography pass: the woff2 files, `public/fonts/montserrat.css`,
  the two `@fontsource` dependencies, the `src/index.jsx` import, and folding
  `--di-mono` into `--di-sans`. Changing the platform typeface and removing
  monospace from ~90 rules across the app is a design decision for the owner
  and wants its own PR, not a ride along an algovrithm branch.
- `src/algoVrithm/audioWake.js` and its tests: already on dev, and in a better
  place — `src/utils/audioWake.js`, promoted out of the piece because the
  question is not algovrithm's. Her branch's copy is the older one.
- `ringTour.js`, `textReveal.js`, `entityAnimation.js`, `positionalVideoSound.js`,
  the `EntityContent`/`Text2DObject` opacity fix, `PublicProjectViewer` and
  `PortalObject` changes, both `projectSchema` mirrors and the
  creation-vs-normalization defaults split: all already on dev, several
  byte-identical. Their `known-fixes.md` entries are on dev too.
- `src/beta/styles/beta.css` and `src/seed/styles/seed.css`: deleted on dev.
- `package.json` / `package-lock.json`: the only real change is the two font
  dependencies, which go with the parked typography PR.

Nothing in either PR was rejected for quality. #254 is a placement question and
#180 is a staleness question, and both are worth telling her plainly.
