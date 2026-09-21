# lights-harness

A lit room rendered through the real `EntityContent`, for LOOKING at a lighting change (beams, aim, shadows) before claiming it works — the harness that proved the spot-light target fix and the "lights on a place" lane.

```bash
npx vite scripts/lights-harness --port 5218 --strictPort   # any free port >= 5200
SHOTS='[["beams","?beams=1"],["beams-shadows","?beams=1&shadows=1"],["scan","?scan=1&beams=1&shadows=1"]]' \
  BASE=http://localhost:5218 OUT=~/Downloads/lights node scripts/lights-harness/shoot.mjs
```

Then open the PNGs — a screenshot nobody looked at is not verification.

Flags on the page: `?beams=1` `?shadows=1` `?scan=1` (the photogrammetry room, `src/algoVrithm/assets/scan.glb`). It lives here and not in `src/` on purpose: `src/works/boundary.test.js` and `src/rigMirror/useLightingMirror.test.jsx` both scan `src/` and both fail on a harness there.
