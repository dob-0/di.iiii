# Show loops: seamless generative background loops

Makes whole-bar, seamless video loops (LED-wall backgrounds) from fragment shaders. A production only supplies a spec
(size, fps, bpm, loops with shader, bars, palette, params); no production name lives in this tool.

## One command that rebuilds everything
    node scripts/show/loops/render-loops.mjs <spec.json>              # all loops, or --only a,b
    python3 -I scripts/show/loops/check-loops.py <spec.json> --sheet  # table + sheet.png; exit 1 on any FAIL; --ready appends READY.txt
Run both as `di-cool 85 600 -- nice -n 19 <cmd>` on a machine in use. Outputs go next to the spec (`out/<name>.mp4`, `sheet.png`, `CHECK.txt`).

## Method
Playwright's own headless Chromium (software GL / SwiftShader, WebGL2), one full-screen triangle, shader `shaders/<name>.frag`
appended to `shaders/_prelude.glsl` (which provides `shade(px, uv)`, noise, palette uniforms uC0..uC2, params uP).
Time is only the loop phase i/N. Every motion must use whole cycles of the phase (sin/cos of TAU*k*phase, noise sampled on a
circle, `mod(floor(phase*K + offset*K), K)` for steps). Frames go out as PNG into ffmpeg: libx264, yuv420p, crf 18, -g 15, no audio, faststart.
Frames = round(bars * 4 * 60 / bpm * fps). Dither is static (fixed in time) so the codec has no temporal noise.
Never use the Flatpak browser; no fixed debugging ports are opened.

## Checks (check-loops.py)
size/fps/duration (within one frame)/h264 yuv420p/<= 15 MB; SEAM: last->first mean abs luma difference <= 1.5 x median neighbour
difference (also compared with the median of the other GOP-boundary steps, because frame 0 is an I-frame; measured reason: every
15th step carries extra codec difference); DARK: share of pixels under 10 % luma >= 0.55 (spec `checks.dark_exempt` reports only);
FLASH: luma jumps > 10 % between neighbouring frames, at most 3 per second.

## Shader parameters (uP.xyzw)
glow-magenta: radius. rings: half-thickness px, rings per loop. bars: cell px, bar px. isolines: levels, half-thickness px.
lights: cell px, dot radius px. chrome: ripple scale, rim strength. glitch: block px, steps per loop, slash count. twotone: period px, angle.

Licence: the repo's licence; our own work, no third-party material.
