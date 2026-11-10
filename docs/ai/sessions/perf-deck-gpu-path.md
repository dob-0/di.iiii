# perf: deck picture path, CPU to GPU (2026-11-10, branch perf/deck-gpu-path)

Owner: "what cpu is load we have gpu optimize this all smart". Measured on his machine at 22:22: renderer 137.7 % + 113.4 %
CPU, GPU process 116 %, GPU 34 %, GPU video decoder 0 %, scrcpy 41.8 %.

## Per-frame CPU costs found (before)

| # | where | what | weight |
|---|-------|------|--------|
| 1 | `src/project/tops/topEngine.js` (`frame`, source branch; `pullRemotes`) | `texImage2D(video)` on every engine tick for every source; `videoMoved` compared `currentTime`, which a live stream moves on every tick, so a 30 fps camera was uploaded 60 times a second | biggest: `texImage2D` 180-220 ms self time per second in the bench (4 sources) |
| 2 | `topEngine.js` `thumbnails` + `useTopNetwork.js` loop | every 3rd frame, every registered tile: a GL draw to the canvas corner plus `drawImage` canvas-to-canvas copy (GPU to 2D canvas) | 105 tile draws/s for 9 tiles; `drawImage` 13-30 ms/s |
| 3 | `topEngine.js` `meanOf`, `operator.measure` | `readPixels` 32x18 (Difference compensation, Analyze), measure throttled by `MEASURE_EVERY_MS` | small, only with those operators |
| 4 | `pictureOut.js` `send` (`toBlob` JPEG per frame, only with a Send Out) | GPU readback + JPEG encode per frame while an output is named | large, only when a Send Out runs |
| 5 | `picturePeers.js` `pump` (`drawNode` per outgoing stream, every frame), `previewTimer` (JPEG) | full-size readback per linked machine, every frame | only with a linked machine |
| 6 | `useTopNetwork.js:~277` `onPreview` | `createImageBitmap` + `drawImage` per received preview | small |
| 7 | `useTopNetwork.js` loop | engine runs the whole network every rAF even when a layer is at opacity 0 or covered | not changed (see below) |

Stage page: `MapOutput.jsx:56` uses no second engine when `MapNetworkSource` draws (one engine per page); each page decodes and
uploads its own copy of every video, so two pages = two full upload sets (unchanged, cannot be shared across pages).

## Bench

`scripts/perf/deck-bench.cjs`, run with `di-test-browser run` on the agent screen (throwaway `di-dev up deck-gpu`, frontend mode;
`--api scratch` could not start: `serverXR` has no node_modules). 4 playing sources (1920x1080 and 640x480 canvas `captureStream`
"cameras", two 1280x720 H.264 mp4 clips from ffmpeg `testsrc2`), 3 Blend + Feedback + Level, engine canvas 1280x720, 9 tiles of
160x90. 15 s per run, 3 interleaved old/new runs per fix, mean shown. Measured through CDP `Performance.getMetrics` (script and
task ms per second of the page) and `Profiler` (top 10 self time, in the JSON). The machine was also running the owner's browsers,
so runs vary by +-25 %; compare means and the counted work, not one run.

| fix | metric | before | after |
|-----|--------|--------|-------|
| 1 upload on new frame only (`videoFrames.js`) | video uploads/s | 121.4 | 87.4 |
| | engine frames/s | 30.4 | 36.3 |
| | script ms/s, task ms/s | 318.5, 550.6 | 327.9, 581.8 (within noise) |
| 2 tile scheduler (`thumbnailPlan.js`) | tile draws/s (9 tiles) | 105.4 | 34.6 |
| | engine frames/s | 35.1 | 45.6 |
| | `drawImage` self ms/s | 13.5-30.6 | 3.6-10.4 |
| | script ms/s | 321.1 | 304.2 (within noise) |

Reading: the work that is counted fell (uploads -28 %, tile draws -67 %) and the frame rate rose 19-30 %, but total script ms per
second did not fall measurably: the engine is main-thread bound, so freed time became extra frames. `texImage2D` of a video is
still 2-3 ms per call; its cost is the copy of a decoded frame, which only a hardware decoder path or fewer uploaded pixels removes.

## Not done (candidates, not confirmed by measurement)

- Skip the upload of a layer at opacity 0 or covered by an opaque Mix (keeps the clock): needs a graph analysis of which inputs reach
  the master; risky for Feedback/Freeze history. Not started.
- Pause the engine of a hidden/occluded tab: rAF and `requestVideoFrameCallback` already stop in a hidden tab; an occluded
  window on X11 is not reported hidden. Not measured.
- Send Out JPEG (#4) and peers pump (#5): throttle to the receiver's want; not measured.

## Browser flags and hardware decode (read only, nothing changed)

- Flatpak Chromium 156.0.8078.47, runtime freedesktop 25.08; `~/.var/app/org.chromium.Chromium/config/chromium-flags.conf` holds
  `--ozone-platform=x11 --use-angle=gl`. `flatpak list --runtime` shows Mesa and `GL.nvidia-615-78-08`, no `VAAPI` extension and no ffmpeg-full.
- CDP `SystemInfo.getInfo` on the agent test browser: `featureStatus.video_decode = enabled` but `videoDecoding = []` (no decode
  profile offered), so decoding is software, matching the owner's 0 % decoder. (Whether the test browser has exactly the owner's flags: not verified.)
- Host `vainfo` (Intel iHD 26.3.5, renderD129): H264 High, HEVC Main/Main10, VP9 P0, AV1 P0 all VLD (decode) on the Intel UHD. `libva-nvidia-driver 0.0.18` and `nvidia-smi` (driver 615.78.08) are installed for NVDEC; decoder utilisation 0 %.
- What it would need (unverified, lead decides): the Intel VA-API Flatpak extension (`org.freedesktop.Platform.VAAPI.Intel`) for the
  runtime, and `--enable-features=AcceleratedVideoDecodeLinux` (plus `VaapiOnNvidiaGPUs` if NVDEC via libva-nvidia-driver, which a
  Flatpak sandbox lacks), possibly `--use-gl=angle --use-angle=gl` kept; decode on the Intel iGPU then costs a cross-GPU copy to the
  NVIDIA that renders. A non-Flatpak Chromium on Wayland is the other route. Test with `chrome://gpu` "Video Decode" and `intel_gpu_top`.
- Phone feed (scrcpy, 41.8 % CPU): scrcpy decodes H.264 with FFmpeg in software; `scrcpy --video-codec`/`--video-decoder`
  hardware options were not read here. Alternatives that skip the decode on this machine: lower `--max-size`/`--max-fps`, or send
  the phone's H.264 through WebRTC to the browser so the browser (with VA-API) is the only decoder. Unchecked.
