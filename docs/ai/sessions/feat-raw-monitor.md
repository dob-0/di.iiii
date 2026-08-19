# feat/raw-monitor — the desk's viewer

Phase 1 of the show spine, part three: the View operator the owner asked for
("we need to view operator"). TouchDesigner's answer is the viewer on every
tile; the browser's honest version is one window you place where you want it.

## What changed

- `stream.monitor` implemented — it existed since 2026-07-30 as a gated shell
  named "Program Monitor" whose window fell through to the text-panel
  placeholder. Ungated, relabelled 'Monitor' (one word, one meaning), and its
  position/width/height ports removed (dead-port rule: no runtime carried
  them; a window has its own frame).
- `MonitorPanelWindow.jsx`: wire any texture into Source and watch it live;
  no wire → a quiet, honest empty state ("Wire a texture into Source"), not
  the generic placeholder.
- `LiveTextureView` extracted from ImagePanelWindow into its own module,
  shared by Image and Monitor (a DOM video element cannot mount twice, so
  frames are copied to a canvas — same code, one home).
- allNodesExample: monitor wired from the webcam's Frame. RawEditor dispatch
  case + empty-state test. Wiki bullet + USER_MANUAL section.

## Verify

Seeded webcam→monitor doc, fake media stream: the Monitor window shows the
live feed (unmirrored — program out), the webcam panel its selfie view; with
nothing wired the Monitor says so. Screenshot read at DPR 2.
