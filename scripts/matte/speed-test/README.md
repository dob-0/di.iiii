# Matte speed test — person silhouette in the browser, measured

`index.html` cuts the person out of a video with MediaPipe tasks-vision 0.10.14 ImageSegmenter
(selfie_segmenter float16, Apache-2.0, GPU delegate) and draws a silhouette over a changing colour at
1920x1080 for 10 s, then reports fps and segmentation time in `window.__result`.
`run.mjs` drives it in the agent test browser (`di-test-browser run`), serving files through `page.route`
(the Flatpak browser cannot read /tmp).

    DI_TEST_CDP=<cdp url> node scripts/matte/speed-test/run.mjs /path/clip1080.webm

Result on aylmo (RTX 3080 Laptop, 2026-11-10), frame scaled to 480x270 before the model:
53.9 fps, 13.76 ms mean / 19.3 ms p95 per frame, person in 533 of 541 frames. Full 1080p into the model: 18.2 fps.
Limits: edges blocky at 480x270; fps capped by the 60 Hz loop; the model URL is "latest" (pin a copy before a show).
