## 2026-11-19 — Monitor fits one screen, wears the di tool look, and its camera is free

- Owner's words: the monitoring UI "is ugly… I need to scroll a lot… the 3D and the other views are limited, camera is locked… make it cool and suit our design, it feels DIY".
- Layout: tabs moved into the header row; status line is one slim row with single-line issue chips; tier and count tiles are one chip strip on every tab (was only the Map tab); What changed sits beside the content, not above it; Board flows in two columns; chat cards are dense (ask and answer clamped). Checked headless at 1536x864 and 1920x1080 (the two real screen sizes): the Map fills the screen with no page scroll.
- Look: di-brand tool register (SYSTEM.md rules 1-6): 1px hairlines, a 2px inset bar carries state, fills at .06/.10, mono tracked uppercase eyebrows, square, no glow.
- Camera: the wheel always zooms the 2D and 3D map (it needed Ctrl or full screen before, so it felt locked); 3D orbit is no longer capped at the floor, zoom range 0.4 to 160, zoom goes to the cursor; 2D zoom range 0.1 to 24x.
- Not done: the Board, Work and Tasks tabs still scroll inside when their own content is longer than the screen (40 services, 129 tasks); the 2D map labels are small at fit until you zoom.
