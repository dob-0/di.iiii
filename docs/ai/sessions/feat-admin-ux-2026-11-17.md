## 2026-11-17 — admin made readable: honest titles, no zero badges, filter chips, one-line phone nav (slice 1)

- The owner called the admin "bad UI … not user friendly and not intuitive". Slice 1 fixes what was measured on screen
  (Chromium, desktop 1440 and phone 390, scratch dev stack): zero badges on nav entries, the page title saying
  "Spaces and who can see them" on Open call and Visitors, dash-only Spaces/Users header cards on those two pages,
  filter buttons drawn as a 2-column wall, and the phone's section list filling the first screen.
- Changes: badges only when > 0; Open call and Visitors titled by their own name and without header cards; the filter row is
  `.preferences-filter-row` chips; under 880 px the nav is one scrolling line with the active entry scrolled into view;
  nav entry "Apps that visit" is now "Visitors" (wiki text updated to match).
- Tests: `PreferencesPage*`, `preferences/*`, `copyVocabulary` suites, 112 passed; new guard in `PreferencesShared.test.jsx`.
- Slice 2, Spaces and users: the Overview card that repeated the header's Spaces/Users (and a lone "Guest space" tile) became "Guest entry" (one sentence); New space moved above Traffic and Sweep; a metric value never wraps mid-date (`2026-11-17`, busiest-day count moved into its label). TrafficSection test updated to the new wording.
- Slice 3, Agent sessions and Monitor: the Agent sessions page was titled "Spaces and who can see them" — now "Agent sessions"; Agents and Monitor drop the header Live/Sessions cards (their own panels say it); session directory rows stay inside their box (grid column could not shrink, so status tags spilled out), long names get an ellipsis.
- Slice 4, operator pages: Machines is titled "Machines" and no longer shows the scene counters and Copy Snapshot / Copy Log / XR Debug; on a phone the header counters sit two per row, so Overview's Quick switches show on the first screen.
- Not done: Overview / This scene / Log and settings keep the H1 "Operator tools" (pinned by a test); a real phone and the owner's look.

- Review fixes (code-review medium on #1302): nav scrolls the active entry in a useEffect on section change (not on every render); a 0 badge never renders in SectionNav itself; Busiest day says "1 view" for one. Not changed: hideHeaderCards/title lists (works, a per-section title field is a later tidy), capitalize on filter chips (labels are authored words), tree grid rule (the tree was already a grid).
- Second review: nav scroll now only moves the phone strip itself (scrollLeft), never the page or a desktop column. Left as is (opinion, not defects): per-section title/headerCards config, phone nav has no group labels or fade, badge guard in two places, filter-chip capitalize, global metric nowrap (checked on the pages shot).
