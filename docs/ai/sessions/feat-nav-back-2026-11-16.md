## 2026-11-16 — navigation round 1: every admin desk and Monitor view has a way back

- Added `src/hooks/useBackEntry.js` (+ test): one history entry per place a person goes to (push once on open, Back runs the view's close, the view's own close removes its entry only when it is on top, an entry left under another is marked dead and skipped, StrictMode-safe by deferring the push one tick).
- `src/components/preferences/useDeskHistory.js`: the admin desk's open-window set is one history entry per change; Back restores the set before it, the desk home when none; the address follows the front window (#key); a deep link `/admin#monitor-full` gets the desk home beneath it, so Back never leaves the site.
- `MonitorSection.jsx`: Full screen no longer replaces the entry (it was why Back left /admin); full screen, inspector drawer, keys card and the Map/Lists tabs are entries; Esc and the own buttons remove theirs. Phone: the bar's Back button steps back one entry.
- Measured with `scripts/ui/nav-audit.mjs` (PR #1297) on a scratch stack, same routes and viewports before and after; the owner's example by hand: `node scripts/ui/nav-back-check.mjs <stack url> <outdir>`.
- Not done (round 2): the rest of the app's pages (see SPEC-navigation.md).
