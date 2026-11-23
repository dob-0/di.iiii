# feat-deck-td-effects — TouchDesigner look effects (2026-11-10)

Why: the owner is a VJ; 249 of his TouchDesigner files were expanded (toeexpand, exact operator types; audit in the td-audit scratch report). The operators he uses most that di.iiii lacked are built as picture operators (`top.*`, `src/project/tops/topOperators.js`) AND as deck effects (`EFFECT_TYPES` in `vjDeck.js`, controls in `EffectsPanel.jsx`). Pattern: `feat-deck-ref-effects.md`. Caveat from the audit: counts are files containing the type; shared template boilerplate may inflate some.

| Effect (deck name) | Operator | Answers TD | Files | Main params (default) | Cost |
|---|---|---|---|---|---|
| Displace | `top.displace` | displace | 184 | Map Picture/Noise/Input B (Picture), Amount X/Y -0.5..0.5 (0), Noise scale (4), Speed (0.5) | 2 map taps + 1 |
| Colour shift | `top.hsvadj` | hsvadj | 53 | Hue -180..180 (0), Saturation 0..2 (1), Value 0..2 (1) | 1 |
| Mirror | `top.mirror` | flip (+ kaleidoscope-like folds) | 61 | Mirror Off/Left to right/Right to left/Top to bottom/Bottom to top/Quad (Off), Flip X, Flip Y | 1 |
| Blend modes | `top.blend` + `BLEND_MODES` | comp / add / multiply | 218 | appended: Subtract, Lighten, Darken, Overlay (old five keep index 0-4) | 2 |
| Key | `top.key` | rgbkey | 58 | Mode Chroma/Luma, Key colour (#00ff00), Tolerance (0.3), Softness (0.1) | 1 |
| Grade | `top.lookup` | lookup (ramp) | 75 | Shadows, Mids, Highlights colours, Amount (1) | 1 |
| Emboss | `top.slope` | slope | 108 | Strength (1), Light angle (135), Depth px (1.5), Keep colour (0) | 2 + 1 |
| Glow | `top.glow` | lumablur + bloom | 48 + 25 | Threshold (0.6), Radius px (12), Amount (1) | 13 taps, one pass |

Design notes
- No alpha in the pipeline, so Over is not built. Key keys to BLACK: use it with the Add, Screen or Lighten layer blend.
- Displace: in the deck only Picture and Noise are useful (the effect's second input is unwired, so Input B maps a black picture = a constant shift); as an operator, wire a picture into `b`. Defaults move nothing (Amount 0), as do Colour shift, Mirror (Off) and Grade at Amount 0. Grade, Key, Emboss and Glow are look effects and change the picture at their defaults.
- Displace is `animated` (noise uses `time`); the engine test's allow-list got `top.displace`.
- EffectsPanel: a param with `options` (a choice) now draws a select instead of a number slider; choices stay in the MIDI numeric index.
- Glow in one pass is a 12-tap golden-angle disc: grainy at large Radius (a two-pass blur would be smoother but needs engine support).

## Verified and not
- Tests: `src/project/tops/vjDeck.tdEffects.test.js` (normalize and clamp, one uniform per param, expansion adds 2 nodes, master, defaults, blend order). `checkShader` returns null without WebGL, so GLSL is not compiled by a GPU in tests.
- NOT verified: no GPU or browser run; no pixel has been seen. Shaders are written to GLSL ES 1.00 (constant loop bound, no dynamic indexing) and all eight fragments compiled with `glslangValidator -S frag` (precision + a, b, uv, texel, time preamble): no errors. A GPU has not run them.
