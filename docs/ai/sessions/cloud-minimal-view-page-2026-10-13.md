## 2026-10-13 — the view page: clear by default, managed from the Studio, in di.iiii's style (cloud, agent #23)

- Owner (two screenshots of /moxir/v2-9 at first load): too many UI things cover the view; make it minimal, di.iiii's own style,
  and manageable from the Studio.
- Rule written: `docs/ai/golden_rules.md` "The scene is the page" and decision 7 in the 2026-10-13 decisions doc.
- View page: `useRememberedOpen` (`src/utils/rememberedOpen.js`, localStorage in try/catch, per viewer). Versions = one chip
  (`RigVersionSwitch` bare), SHOW chip closed (`RoomLookFollower`; it was open), the ten bricks behind a "Scenes" control
  (`RoomFavourites`), layers + Inside/Free + Lite/Full behind a "Display" chip (`DisplayChip.jsx`), the scene bar draws no strip
  (each chip is its own glass; the air between them reaches the scene). Edit in Studio only when the session can edit.
- Studio: Project > "What visitors see" (`VisitorChromeSection`), switches stored in `presentationState.visitorChrome` and, for a
  production, in `productionViews.visitorChrome` (`src/shared/visitorChrome.js`, `writeChromeEverywhere`). Studio SCENES window
  folded by default.
- Chrome tokens: `src/rigbuild/chromeStyle.js`.
