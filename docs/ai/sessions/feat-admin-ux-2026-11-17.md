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
- Not done: Monitor, Agent sessions, Overview; a real phone and the owner's look.
