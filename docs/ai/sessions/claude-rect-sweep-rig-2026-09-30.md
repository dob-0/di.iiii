## 2026-09-30 — Controls are rectangles: the rig-line sweep

**Done.** `src/rigbuild/build.css` (mode pill 999px→2, round thumbs 50%→2, place button 36px→2, hotbar/slots/totals/status/aimed 3–4px→2), `RoomLookFollower.jsx` show chip 22px→2, `ProjectSwitcher.jsx` panels (18/12/8→2), `overlayCardStyle` 18→2. No panel keeps 4 px. `--di-radius-pill` untouched.

**Kept round:** only the show chip's recording light (`RoomLookFollower.jsx`, 8×8 `50%`, a status dot). No swatch or joystick knob exists in these files. It is in the test's allow-list with that reason.

**Guard:** `src/rigbuild/controlsAreRectangles.test.js` scans `src/rigbuild/**` (css/jsx/js), ProjectSwitcher and publicViewerStyles. On the base it fails with 13 offences; with the change it passes.

**Measured.** Full `npm run test -- --run`: with change 159 failed / 7106 passed; base 159 failed / 7102 passed (the same 159 fail on both — serverXR/scripts suites that cannot load on this machine; not investigated). Lint: 0 errors. Not run: `test:server-contracts`, build.

**NOT seen on a real screen.** No browser was used; nothing was looked at on desktop or phone. In particular the 52 px thumbs and 112×72 place button are now rectangles and their look and reach are UNVERIFIED. `ProjectSwitcher` was changed by reading code only.

**Still owed (outside the rig line, not touched) — `file:line` of a pill or circle:**

```
  src/components/loadingScreen.css:22
  src/components/webglContextGuard.css:20
  src/components/liveProjectScene.css:28
  src/components/liveProjectScene.css:61
  src/components/liveProjectScene.css:155
  src/components/liveProjectScene.css:192
  src/components/liveProjectScene.css:211
  src/components/liveProjectScene.css:224
  src/components/liveProjectScene.css:261
  src/components/liveProjectScene.css:295
  src/components/liveProjectScene.css:300
  src/components/liveProjectScene.css:308
  src/components/liveProjectScene.css:309
  src/components/authReturnNotice.css:11
  src/algoVrithm/algoVrithm.css:113
  src/algoVrithm/algoVrithm.css:247
  src/algoVrithm/algoVrithm.css:296
  src/algoVrithm/algoVrithm.css:306
  src/kit/kit.css:185
  src/kit/kit.css:203
  src/kit/kit.css:244
  src/kit/kit.css:280
  src/make/makeSurface.css:284
  src/make/makeSurface.css:498
  src/make/makeSurface.css:506
  src/make/makeSurface.css:667
  src/perform/perform.css:306
  src/chat/StudioChatSurface.jsx:429
  src/chat/ChatHomeSurface.jsx:58
  src/chat/ChatHomeSurface.jsx:112
  src/styles/base.css:80
  src/styles/mobile-shell.css:48
  src/styles/controls.css:203
  src/styles/controls.css:212
  src/styles/inspector-controls.css:171
  src/styles/inspector-controls.css:180
  src/styles/inspector-controls.css:187
  src/styles/inspector/overlays.css:36
  src/styles/inspector/misc.css:74
  src/styles/inspector/misc.css:96
  src/styles/inspector/misc.css:147
  src/styles/inspector/misc.css:164
  src/styles/inspector/misc.css:192
  src/styles/inspector/misc.css:207
  src/styles/inspector/misc.css:221
  src/styles/preferences.css:459
  src/styles/panels/base.css:141
  src/styles/panels/base.css:148
  src/styles/panels/asset.css:176
  src/styles/panels/spaces.css:43
  src/styles/workspace.css:210
  src/styles/workspace.css:227
  src/styles/workspace.css:323
  src/project/components/jamSurface.css:68
  src/project/components/jamSurface.css:85
  src/project/components/jamSurface.css:119
  src/project/components/jamSurface.css:136
  src/project/components/jamSurface.css:157
  src/project/components/jamSurface.css:193
  src/project/components/jamSurface.css:301
  src/project/components/jamSurface.css:362
  src/project/components/jamSurface.css:380
  src/raw/styles/raw.css:605
  src/raw/styles/raw.css:1594
  src/raw/styles/raw.css:2271
  src/raw/styles/raw.css:3265
  src/raw/styles/raw.css:3604
  src/raw/styles/raw.css:4665
  src/raw/styles/raw.css:4711
  src/raw/styles/raw.css:4743
  src/raw/styles/raw.css:4876
  src/raw/styles/raw.css:4891
  src/raw/styles/raw.css:5131
  src/raw/director/director.css:767
  src/wccSite/landing/landing.css:97
  src/wccSite/landing/landing.css:128
  src/wccSite/landing/landing.css:166
  src/wccSite/landing/landing.css:254
  src/wccSite/landing/landing.css:269
  src/wccSite/landing/landing.css:301
  src/wccSite/landing/landing.css:502
  src/wccSite/landing/landing.css:805
  src/wccSite/landing/landing.css:839
  src/scan/scanSurface.css:82
  src/scan/scanSurface.css:190
  src/scan/scanSurface.css:321
  src/scan/scanSurface.css:329
  src/pages/spaceContents.css:102
  src/studio/styles/studio-help.css:94
  src/studio/styles/studio-help.css:178
  src/studio/styles/studio-help.css:187
  src/studio/styles/studio-help.css:254
  src/studio/styles/studio-help.css:264
  src/studio/styles/studio-help.css:340
  src/studio/styles/studio-coach.css:16
  src/studio/styles/studio-coach.css:38
  src/studio/styles/space-constellation.css:105
  src/studio/styles/studio-mobile.css:86
  src/studio/styles/studio.css:321
  src/studio/styles/studio.css:444
  src/studio/styles/studio.css:1110
  src/studio/styles/studio.css:1120
  src/studio/styles/studio.css:1209
  src/studio/styles/studio.css:1221
  src/studio/styles/studio.css:1549
```
