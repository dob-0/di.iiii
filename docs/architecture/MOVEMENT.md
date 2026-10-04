# Movement — how the camera moves in a room

The owner, 2026-09-30, on MOXIR: *"movement is hard, when I want to go back I get stuck, hard to
get back to normal. I want to improve movement."* Then: *"look in Blender, there are settings
where you can zoom max to the object"*, *"take all settings from the Blender idea, so someone who
knows Blender can also work in ours"*, and *"when you want to look from far away you go out through
the walls."*

Code: `src/project/viewport/navigation/` — `navigationMath.js` (every decision, plain functions,
tested in `navigationMath.test.js`), `Navigation.jsx` (inside the canvas: measures the scene,
applies the decisions to camera-controls), `NavigationControls.jsx` (the Home button, the `?`
card). Mounted by `StudioViewport` when a surface passes `navigation`:

| surface | `navigation` | what it gets |
|---|---|---|
| published room, orbit (`PublicProjectSceneSurface`) | on, unless the camera is locked or it is a `?preview=1` card | everything below |
| Studio viewport pane (`StudioPresentationSurface`) | wheel only | zoom to the pointer, Blender's mouse set; **not** the keys, double-click, Home button or card — the Studio has its own (F frames the selection, Shift+? is its help) and editing must not change under a hand |
| walk / fly (`LiveProjectScene`) | — | Blender's Shift (faster ×5) and Alt (slower ×0.25), Esc leaves |
| orthographic cameras, `?preview=1` cards, locked cameras | off | unchanged |

`scripts/movement/measure.mjs` is the measurement (see Measured); `scripts/movement/rig.mjs` its
harness.

## What was wrong (measured 2026-09-30, feat/smart-view code = rigbuilder.9 orbit + smart view)

See "Measured" below for the numbers; in words: there was **no way home** (Home, Escape,
double-click did nothing from any state, and nothing anywhere remembered the opening view — the
viewer overwrote it on the first drag); the wheel zoomed at a fixed rate about an orbit point
that stayed where it was, so **scrolling in toward a thing stopped 0.35 m from an invisible
point, not at the thing** (Blender's manual describes exactly this limit: "zooming only gets you
up to the point of interest and no further" — Blender's answer is Auto Depth + Zoom to Mouse
Position, below); a camera left against a wall or column showed a black screen and the wheel
moved it centimetres per notch; and from far outside the hall the rig was a few dozen pixels.

## Blender's navigation, and what we took

Source: the Blender 5.2 LTS manual, read 2026-09-30 —
Preferences ‣ Navigation (<https://docs.blender.org/manual/en/latest/editors/preferences/navigation.html>),
3D Viewport ‣ Navigate ‣ Navigation (`…/editors/3dview/navigate/navigation.html`), Viewpoint
(`…/viewpoint.html`), Fly/Walk Navigation (`…/walk_fly.html`).

The two quotes the work rests on:

> **Auto Depth** — "Use the depth under the mouse to improve view pan, rotate, zoom functionality.
> Useful in combination with Zoom To Mouse Position."
>
> **Zoom to Mouse Position** — "When enabled, the mouse pointer position becomes the focus point of
> zooming instead of the 2D window center. Helpful to avoid panning if you are frequently zooming
> in and out. **Tip:** This is useful in combination with Auto Depth to quickly zoom into the
> point under the cursor."

| Blender (manual page) | Ours | Notes |
|---|---|---|
| Zoom to Mouse Position + Auto Depth (Preferences ‣ Navigation) | **on, always**, wheel and pinch | the depth is a raycast against what is drawn: not hidden things, not beams or haze (additive / transparent / no depth write), not parts the cutaway or x-ray has removed. Nothing under the pointer: the depth of the orbit point. |
| Auto Depth for rotate and pan | the orbit pivot and pan anchor are the surface under the pointer when you press — **never farther than the point of interest you already had** | see "Not adopted" |
| Zoom: "Moves the view closer to, or further away from, the point of interest" — Wheel, Ctrl-MMB, NumpadPlus/Minus | wheel, Ctrl + middle drag, Numpad + / − | one notch = ×1.136 of the distance to the point under the pointer (what the old wheel measured), so travel is fast across a hall and fine at a surface; a 0.15 m near limit so the camera never passes a surface |
| Orbit — MMB; Numpad 4 6 8 2 (15° "Rotation Angle"); Alt-MMB alignment | middle drag; Numpad 4 6 8 2 in 15° steps (camera moves left / right / up / down) | left drag still orbits (it always did, and it is the phone's one finger); Alt-MMB axis snapping not adopted |
| Pan — Shift-MMB, Ctrl-Numpad 4 6 8 2 | Shift + middle drag; Ctrl + Numpad 4 6 8 2; right drag (kept) | |
| Emulate 3 Button Mouse (Preferences ‣ Input) | Alt + left drag = middle (with Shift: pan, Ctrl: zoom) | for a trackpad; on KDE, Alt+drag can be claimed by the window manager |
| Frame All — Home | **Home = the room's opening view**, a button (bottom right, 44 px), double-click / double-tap on empty space | a room's "all" is its authored opening shot, which is what the owner calls normal; glides (smoothTime 0.28–0.5 s by distance), from any state |
| Frame Selected — Numpad . | **F or Numpad .** frames the object under the pointer; double-click / tap on an object does too | a published room has no selection, so "selected" is "pointed at". In the Studio F stays the Studio's own frame-selected |
| Viewpoint — Numpad 1 / 3 / 7, Ctrl for the opposite | same: front (from +Z, the audience side), right, top; Ctrl the opposite | perspective, distance kept, glides. The top-row 1–6 stay the smart-view presets (Blender's top-row digits are collections) — Numpad codes are ignored by the preset keys |
| Walk Navigation — WASD, Shift faster, Alt slower, Esc leaves ("In case you want to go back to where you started, press Esc") | the existing walk mode gains Shift ×5 (Blender's Speed Factor default), Alt ×0.25, Esc → back to view mode | Blender's E/Q up/down and wheel = speed not taken: walk keeps its own (Space/Q up, C/E down; wheel steps forward) |
| Smooth View (animation when changing views) | camera-controls' damping, `smoothTime` 0.15 s; the glide home 0.28–0.5 s | |

The `?` key (or the small `?` button) opens a card with this table's keys, in the viewer.

### Not adopted, and why

- **Numpad 5 (perspective ↔ orthographic) and Auto Perspective.** Our orthographic path is the
  Studio's small-lens trick (a 18–24° lens reads as a plan), not a projection switch; a real
  switch touches the smart view's presets, the frustum fit and the XR path. Owed, not cheap.
- **Orbit Around Selection.** There is no selection in a published room; in the Studio it would
  change what editing feels like under a hand. Blender's own manual warns it is "inconvenient for
  larger objects … where the center is not necessarily a point of interest".
- **Trackball orbit / Orbit Method.** camera-controls is turntable (Blender's default) — the
  horizon stays level, which is right for a room.
- **Roll (Shift-Numpad 4/6), Dolly View, Zoom Region, Alt-MMB axis snapping, Zoom Style
  (Scale/Continue/Dolly).** Not asked, not broken.
- **Fly navigation, Tab gravity, Space teleport, V jump.** Walk mode exists with its own model
  (portals, XR); adding Blender's would be a second walker.
- **Two-finger twist to rotate.** Blender has no touch; OrbitControls/camera-controls have no twist;
  we keep one finger = orbit, two = pan + pinch-zoom at the fingers' centre.

## The pivot rule (a deliberate choice, unvalidated)

Blender with Auto Depth turns the view about the depth under the mouse. Taken literally, pressing
on a far wall swings the camera round it — a 60 m arc. We use `min(depth under the pointer, depth
of the current point of interest)`: grab something near and you turn about it; grab something far
and you turn about what you were already looking at. Zooming to a point re-centres the pivot on
it (Blender's Dolly View does too). If this feels wrong to a Blender hand, the one line is
`Navigation.jsx › onDown`.

## A camera that stops inside a surface

Six short rays (±X ±Y ±Z, 0.3 m) from the camera when it comes to rest. A drawn front face nearer
than 0.1 m pushes the camera out along the normal; a back face that near means the camera is
inside a solid — it leaves through it. Only at rest: a glide to a preset outside the hall passes
through walls on purpose (the cutaway is what makes it read).
