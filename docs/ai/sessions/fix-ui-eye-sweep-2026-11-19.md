## 2026-11-19 — human-eye sweep of the web UI (not /admin): wiki phone column and tools card head fixed

Detector: `scripts/check-box-escape.mjs` (from `origin/fix/ui-box-escape-2026-11-17`) at 1440/700/390. Pictures: own driver on `di-test-browser` (agent screen), scratch copy `eye.diiii.localhost` (auth disabled, so no route sat behind a gate; the scratch dev banner chips are dev-only chrome). Pictures walked by eye: each route's first screens at 390, 700, 1440 (up to 8 scroll steps for long pages). Pictures kept in `~/work/agent-reports-2026-11-19/eye-sweep/`.

Routes (from `src/RootApp.jsx`, `src/utils/spaceRouting.js`): `/`, `/wiki`, `/studio`, `/tools`, `/for-apps`, `/ai/setup`, `/privacy`, `/terms`, `/device`, `/main`, `/raw`, `/make`, `/kit`, `/map`, `/scan`, `/perform`, `/spaces`, `/projects`, `/chat`, `/open`, `/studio/open`. Not visited: `/admin` (other agents), `/light/*` (rule), `/shoot/{key}` (needs a real sheet).

| route | size | what | severity | fixed? |
|---|---|---|---|---|
| /wiki | 390 | article box 37 px wider than the window (141 detector hits): phone layout track `1fr` and the content grid's implicit column sized to content | high | yes, wiki.css |
| /tools | 700 | card's "where" label 15 px past its card (`flex-shrink: 0`) | medium | yes, kit.css |
| /wiki | 390 | sidebar lists ~100 article titles before the first article (279 k px page) | note | no, redesign (needs a collapsed index) |
| /studio | 1440 | space URL in a narrow card elided with "…" next to Copy | low | no, intentional elision |
| /open | 390 | Share and + buttons sit under the dev-copy banner | dev only | no, banner is not in production |
| /wiki | 1440 | Ask di block fills 60 % of the width, empty band right | low | no, composition choice |
| all other routes listed above | 390/700/1440 | 0 escapes, no sideways scroll, nothing cut | none | n/a |

Before: 2 routes/sizes with escapes (/wiki 390: 141, /tools 700: 1). After: 0 on /wiki 1440/700/390, /tools 1440/700/390, `/` 1440/700/390.
Menus/dialogs: the click walk (`More`, `Open a file`, `New space`, ...) was started but the browser heat gate stalled it; only /wiki `Ask` and /studio `Open a file`, `New space` were clicked (no popover left the window). Hover cards and drawers were not walked: not done.
Detector run after the fix covered `/wiki`, `/tools`, `/`; the other routes were not re-run (unchanged files).
