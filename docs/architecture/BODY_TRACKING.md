# Body tracking (the Body effect, `top.matte`)

How the deck finds a person in a live camera and cuts them out, what limits its quality, and what each setting does.
Written 2026-11-13 for the Platina show. Code: `src/project/tops/bodyMatte.js`, `bodyMatteWorker.js`, the `top.matte`
operator in `src/project/tops/topOperators.js`.

## What it does

The Body effect answers one question for every pixel of the picture: is this a person or not. With that answer the
effect paints the person and the background separately:

| Setting | Does |
|---|---|
| Fill | 1 = the person is a flat shape in the Body colour; 0 = the person keeps their own picture |
| Background | the colour outside the person |
| Keep room | 0 = flat Background colour; 1 = the room stays around the person, dimmed |
| Softness | how wide the outline fades. Low = a hard cut-out |
| Fine edge | redraws the outline along the edges of the live picture (see below) |
| Echo | contour lines left behind the person as they move |
| Invert | swaps person and background |
| Shade, Drift | tint of the body from the background colour; slow turn of the background hue |

The scenes of the Platina set that use it: HEAT, THERMAL, SILHOUETTE, NEGATIVE, FLASH, ECHO, FLASH FAST, BURST BODY
(`~/work/platina-show/deck-scenes.cjs` holds their values).

## How the person is found

1. The picture the stack started from (the camera) is scaled to 480 x 270 and handed to the model.
2. The model is MediaPipe tasks-vision 0.10.17 `ImageSegmenter` with `selfie_segmenter.tflite` (float16), run in a
   worker on the graphics card, in VIDEO mode. The files ship with the app under `public/vendor/`; nothing is fetched
   from the internet. The model loads the first time a Body effect is switched on and closes when none is on.
3. The model returns a confidence per pixel (0 = background, 1 = person). The engine uploads it as an 8-bit texture
   (`mask`) and the shader reads it.

While the model loads, or if it cannot run, the effect passes the picture through unchanged (never black).
One model serves every Body effect on a page. The deck page and the wall page each run their own.

## Why the plain mask looks rough

- **It is small.** The model works on about 256 pixels across inside. On a 1920-wide picture one mask cell covers
  7 to 8 pixels, so a hard cut-out shows steps and blobs.
- **It is late.** The answer arrives one to three frames after the picture it was made from. On a fast move the
  outline trails the body.
- **It flickers at the edge.** Hair, fingers and dark clothes on a dark wall sit near 50 % confidence.

## Fine edge (2026-11-13)

The live picture is sharp and current; the mask is neither. Fine edge uses the first to repair the second
(a joint bilateral upsample, in the shader, no extra model run):

- Around each pixel the shader reads the mask at 20 points on a disc (radius 3 to 16 pixels, set by Fine edge).
- A point counts only as much as its picture colour matches this pixel's colour. Same colour means the same side of
  the outline. So the mask value a pixel gets is the average over the neighbours that look like it.
- Result: the outline moves onto the real edge of the body in the picture, at the picture's own sharpness, and it
  moves there in the current frame even when the mask is a frame late. Where the picture has no edge at all
  (black hoodie on a black wall) it is a plain smoothing of the mask, which removes the steps but cannot invent an edge.

Cost: 20 extra reads of the picture and of the mask per pixel, only on the Body effect and only when Fine edge is
above 0. Default is 0, so decks made before this look as they did.

Use Fine edge 1 with Softness around 0.06 for a hard silhouette. For the soft thermal look (HEAT) the softness of
the scan hides the outline anyway.

## What decides the quality, in order

1. **The camera.** Light on the person and a background that differs from them. A person in black on a dark stage
   has no edge for anything to find. A backlight or a lit back wall fixes more than any setting.
2. **The camera feed.** The phone through DroidCam is low resolution and compressed, with a watermark. The capture
   card gives a cleaner picture and a cleaner mask.
3. **Fine edge** for the outline.
4. **The model.** See below.

## Not done yet: a heavier model

`selfie_multiclass_256x256.tflite` (hair, skin, clothes as separate classes) follows hands and hair better. It is
several times heavier than the selfie model. It is NOT in the app: it has to be added under
`public/vendor/mediapipe-models/`, the worker has to read "1 minus the background class" instead of the single mask,
and its speed has to be measured on the show machine with the deck and the wall both running before it goes near a
show (the selfie model measured 26.6 ms a run on the card; a model that halves the frame rate is not an upgrade).

Pose landmarks (a skeleton: 33 points per person) are a different MediaPipe task and are not used here. They would
give positions to drive graphics from, not a better cut-out.

## Checking it

- `node deck-scenes.cjs --api http://127.0.0.1:4480/serverXR --project platina-screen --check` says whether the scene
  set (and with it the Body values) is in place.
- `powershell -File ~/work/platina-show/tv-shot.ps1` takes a true picture of the TV.
- The effect row on the deck says `body model loading` or `body model not available` when the model is the problem.
