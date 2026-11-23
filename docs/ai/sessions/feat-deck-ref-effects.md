# feat-deck-ref-effects — the Platina look effects (2026-11-10)

Owner: "look to Platina refs and make the same effects". Five new picture operators, usable in any deck effect stack (layer or master). Built on `feat-deck-effects.md`; operators in `src/project/tops/topOperators.js`, offered in `vjDeck.js` `EFFECT_TYPES` (the panel reads that list, no panel change).

## What the references show (frames extracted with ffmpeg, looked at, 2026-11-10)

The clips are phone recordings of a screen at the concert, so colour is the camera's.

| Reference | What the frames show |
|---|---|
| IMG_1299.MOV (5.3 s) | Wide shot of a crowd under haze and phone lights; frames 1-3 the picture is cool teal/white and soft; later frames show the stage, orange flame-shaped figures over a pink/white haze. The look is a held, hazy full-frame picture (the chat says it freezes before the drop). |
| IMG_1277.MOV (5.4 s) | Black-and-white video of a seated figure, broken into rectangular blocks that sit offset from each other (block displacement, 8-30 px steps, changing frame to frame), with red hand-drawn text ("SALAME +10", "friends ON DECK", "MAIN music") on top. The grey is true grey: no colour in the video layer. |
| IMG_1301.MOV (7.2 s) | A big dark figure shape inside a full-screen flat colour field that changes: magenta, red/orange, violet/blue-peach, red, magenta. The figure is a slightly darker shade of the field, one flat shape; the lit stage and light beams show around it. A small real performer stands at the right. |
| IMG_1300.MOV (7.7 s) | Deep blue field; the body is a white-hot glow with thin nested contour lines (iso-lines, 6-12 bands) of light blue running along it, like a topographic map of the figure. Lines thin, one colour, on blue/black. |
| 3965962081840748693.mp4 (38 s) | Black/white/grey silhouettes: the figure is a flat bright or dark grey shape (depth-map style), background a smooth grey ramp or black; a green stage shot with a white figure at one point. |
| photo-2897.jpg | Mostly black; a bright grey figure silhouette in the centre with a strip of the original picture (cars, a plane) shown through in horizontal bands that are shoved sideways: glitch bars over a silhouette. |

## Effects built

| Operator | Params (main in bold) | Does |
|---|---|---|
| Freeze `top.freeze` | **Hold** (0/1, default 1) | Holds the frame that was on screen when it was switched on (stateful: reads `self` like Feedback). |
| Silhouette `top.silhouette` | **Threshold** 0-1, **Softness** 0-0.5, **Invert**, **Subject** colour, **Background** colour | Luma threshold with smooth edge: one flat colour for the subject, a second for the rest. |
| Line art `top.lineart` | **Contours** 1-40, **Line width** px, Outline 0-1, **Line** colour, Background colour | Thin one-colour iso-lines of brightness plus a Sobel outline. |
| Glitch `top.glitch` | **Amount**, **Speed** (changes/s), Blocks, **RGB split**, Scanlines | Block displacement + row shoves + RGB split + scanlines; every value is a hash of block and `floor(time*speed)`, no random call. |
| Pixelate `top.pixelate` | **Block size** px, **Posterize** levels (0 off), **Grey** | Mosaic, optional posterize and grey. |

Transparency: the picture pipeline is RGB only (canvas `alpha: false`). "Transparent" therefore means black plus the layer blend Add or Screen (what is black adds nothing, the layer below shows). Silhouette with Background black does exactly that. Freeze: an effect that is OFF has no node, so switching it on creates a fresh node and freezes that moment; switching it off drops the held frame.

## Recipes: reference -> look -> stack

Effects run top to bottom of the stack. Values are starting points; the stack is tuned by eye on the real picture.

| Reference | Look | Stack (layer unless said) |
|---|---|---|
| IMG_1299 | Picture freezes before the drop | MASTER stack: Freeze (Hold 1). On = the frame at that moment stays; off = live again. Put it on the master to freeze everything, or on one layer to freeze only that. |
| IMG_1277 | Grey glitch pixel video + red text | Video layer: Pixelate (Block size 6-10, Grey on, Posterize 6) then Glitch (Amount 0.5, Speed 6, Blocks 12, RGB split 0.1, Scanlines 0.2). Text on a second layer above, Add blend, over it. |
| IMG_1301 | Coloured silhouette over a changing colour background | Layer 1: a colour clip or Gradient/Clouds that changes (Tint mix animates it). Layer 2: the performer footage with Silhouette (Threshold 0.45, Softness 0.08, Invert on for a dark figure, Subject = dark shade, Background #000000), layer blend Multiply (figure darkens the colour) or Screen with a bright Subject colour. Only the figure shows, the background is layer 1. |
| IMG_1300 | Blue line-art body | Performer layer: Blur (size 2) then Line art (Contours 10, Line width 1.5, Outline 0.4, Line #4da6ff, Background #000000); layer blend Add over a blue clip/Gradient. For the white-hot core add Level (gain 1.4) before Line art, or a second layer with Silhouette only. |
| 3965962081840748693.mp4 | Black/white silhouettes | Silhouette (Threshold 0.5, Softness 0.03, Subject #ffffff, Background #000000; Invert on for a dark figure on a light wall). Add Pixelate Grey/Posterize 4 for the flat depth-map grey. |
| photo-2897.jpg | Silhouette with glitch bars | Silhouette (Threshold 0.55, Softness 0.15), then Glitch (Amount 0.6, Speed 4, Blocks 8, RGB split 0, Scanlines 0). |

## Verified and not

- Unit tests (`src/project/tops/vjDeck.refEffects.test.js`): 28 tests, in the effect list, params clamp, one uniform per param, expansion adds exactly 2 nodes (effect + mix) on a layer, off adds none, works on master.
- Every fragment compiled with `glslangValidator -S frag` as GLSL ES 1.00 with the engine preamble: no errors.
- NOT verified: no GPU in the test environment (`checkShader` returns null without WebGL) and no browser was used, so no pixel of any effect has been looked at; the recipe values above are reasoned from the frames, not tuned on a screen. Freeze's "alpha 0 = nothing held" relies on a new render target being zero-cleared (WebGL spec: texImage2D with null data) — unseen on a real GPU.
