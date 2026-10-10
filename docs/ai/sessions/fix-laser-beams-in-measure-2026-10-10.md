## Measurement API reads beam-only laser lines (`__diMeasure.beams()`)

Cause: `lampsOf` lists only SpotLights; lasers are `LaserLines` ribbon meshes with no light. Fix: `beamsOf` / `beams()` in MeasurementMode.jsx (position, direction, flux, drawn, diameter, divergence per line). Test: measureLights.test.js. Owed: drawn_fraction frames (#864) on the RTX 3080.
