## 2026-09-30 — the rig steps menu follows the menu-button pattern

Bug (from a code read, now proven by tests): the folded steps row's `role="menu"` had plain links
inside it, focus stayed on the trigger when it opened, no arrow keys, Esc closed without returning focus.

- `src/rigbuild/RigSteps.jsx`: trigger `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`
  (menu id via `useId`, set while open); items `role="menuitem"` `tabIndex=-1`; opening focuses the
  first item; ArrowDown/Up (wrapping), Home, End move; Esc closes and focuses the trigger; Tab closes
  (focus goes to the trigger, so Tab moves on from there); outside pointerdown closes (unchanged).
- `src/rigbuild/rigSteps.css`: only a 2 px focus outline on the trigger and menu items. Targets stay
  44 px (`.sbar-menu-link` min-height, `--di-touch-target` on coarse pointers), corners untouched
  (golden rule "Controls are rectangles").
- Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- Tests (`src/rigbuild/rigSteps.test.jsx`, jsdom + user-event): 5 new plus one updated (links to
  menuitems). With only `RigSteps.jsx` reverted: 4 fail (trigger attributes, first-item focus and arrows,
  Tab, the updated list test). The Esc-focus and outside-click tests pass on the old source too (a
  click already focused the trigger in jsdom), so they guard against regression, they do not prove the fix.
- NOT seen on a real screen: no browser, no screen reader, no touch device. jsdom does not draw the
  outline or model real Tab order across a portal; owed: look at it on the owner's screen and with a
  screen reader (NVDA/VoiceOver).
