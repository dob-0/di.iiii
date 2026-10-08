## 2026-10-08 — View settings (Blender-named), dolly-through zoom, clip planes that follow the distance

- Owner: "I want all settings accessible — it feels unprofessional; I want unlimited zoom", then "as Blender does it, exactly the same way, and keep it in the di.iiii design".
- Source read (Blender 5.2 manual, fetched 2026-10-08): navigation.html (Orbit MMB, Pan Shift-MMB / Shift-Wheel, Zoom Wheel / Ctrl-MMB, Dolly View Shift-Ctrl-MMB "keep moving in past the point where zoom stops"),
  preferences/navigation.html (Orbit Sensitivity, Auto Depth, Smooth View ms, Zoom to Mouse Position, Invert Zoom Direction, Walk/Fly speeds), 3dview/sidebar.html (Clip Start/End: nothing nearer/farther is drawn; a huge range costs depth precision).
  The manual gives NO numeric defaults and NO zoom limit; the defaults here are di.iiii's.
- Built: `viewSettings.js` (one list the panel draws from and the camera reads, per browser, Reset), `ViewSettingsPanel.jsx` (Navigation / Orbit & Pan / Zoom / Clip / Look; di.iiii tokens, rectangles, 44 px targets), mounted in the public viewer (Settings button)
  and Studio's Display group (View settings). StudioViewport takes its CameraControls props from the settings; SmartView takes closest/farthest distance and drops the target box when Dolly through is on; near/far follow the distance inside Clip Start/End.
- Blender mouse mapping completed: Shift-Ctrl-MMB = Dolly View (infinityDolly for that gesture), Shift-Wheel pans.
- Measured (real RTX 3080, di-test-browser): the first version let zoom-out run to 1e14 m (infinityDolly acts at BOTH ends, it pushes the target away at maxDistance). Now Dolly through is switched per wheel notch, zoom-in only, and the farthest zoom-out is a quarter of Clip End (default 20,000 m -> 5,000 m): measured 4,986 m out; 150 notches back in reach 27 m.
  Blender gestures: Shift-MMB pan 13.4 m per 200 px, RMB does nothing, Ctrl-MMB zoom, Shift-wheel pans, wheel zooms.
- NOT done: Home / Numpad-period framing, Zoom Method, Orbit Method (Turntable/Trackball), Walk/Fly settings, Focal Length; Shift-Ctrl-MMB Dolly View not measured; not touched by the owner's hands.
