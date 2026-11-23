## 2026-11-22 — Monitor map: bars and overlays never overlap, full screen covers the page

- Owner picture: in the 3D Map the view bar sat on the camera tools, the hint text sat on the legend, "Exit full screen" broke into three lines and full screen stayed inside the page column.
- Cause of the full-screen miss: `.monitor-page .monitor-map { position: relative }` came later than `.monitor-map.is-fullscreen` with the same weight, so the map was never fixed; now it only applies when not full screen.
- Hint and legend now share one foot (2D and 3D), the stage isolates its 3D card labels so the bars stay on top, buttons keep one line, camera tools wrap from the right.
- The view bar sits above the stage when the map is under 960 px wide (container query); on the Map tab under 1200 px the map takes the full width and "What changed" goes below it.
- Checked by headless pictures at 543x680, 960x800, 1152x864, 1280x720, 1536x864 (page and full screen): 0 overlaps in the measured fit check, every picture read.
