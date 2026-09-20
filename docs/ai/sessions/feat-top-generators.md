## 2026-09-20 — five picture generators, and an engine clock

Raw's picture operators (`src/project/tops/`) could only ever START from a
camera. Added an engine-wide `time` uniform and five generator/adjuster
operators so a network can start from nothing and land on a projector warm.

- **Engine clock** (`topEngine.js`): `time` (seconds, monotonic from the
  engine's own creation, wrapped at 3600s — `clockSecondsFor`, exported and
  pure) reaches every fragment through the shared preamble, declared `highp`
  behind the standard `GL_FRAGMENT_PRECISION_HIGH` guard so mediump's ~10-bit
  mantissa (fine everywhere else) doesn't turn a slow drift into a stutter
  once the clock is up near 3600. The engine already redraws every operator
  on every `requestAnimationFrame` regardless of content — there is no
  per-operator dirty-tracking here to preserve or break. `animated: true` is
  new declared data on an operator (Clouds, Shape) that reads `time`; nothing
  currently reads the flag to skip a draw, it just documents which operators
  cannot be treated as static.
- **Five operators** in `topOperators.js`: `top.noise` "Clouds" (fbm value
  noise, 4 octaves max via runtime masking not a dynamic loop bound),
  `top.ramp` "Gradient" (4-way gradient, two colour stops), `top.tint` "Tint"
  (duotone, black→amber default), `top.transform` "Reframe" (scale/rotate/pan,
  3 edge modes), `top.shape` "Shape" (Circle/Ring/Bar/Grid of dots, dim amber
  default, Spin). "Noise" and "Transform" were the TD names asked for but both
  were already spoken for (`value.noise`, `geom.transform`) — one word, one
  meaning — so the labels became Clouds and Reframe; type ids kept the TD
  names.
- **Colour params**: smallest-honest version — a `colour()` helper storing a
  `'#rrggbb'` string (same shape every other colour field in this app already
  uses), a `type: 'color'` configInput so the existing inspector colour box
  draws it unmodified, and the engine uploads it as `vec3` via a new
  `hexToRgb01` (pure, tested, falls back to black on a bad value — never
  white).
- Everything downstream (`FAMILY_BY_TYPE`, `nodeAnatomy` manifest,
  `nodeLabelVocabulary` guard, `buildTopNodeTypes`) already derives from
  `TOP_OPERATORS`/`TOP_TYPE_IDS` generically — no manual updates needed there.
  `allNodesExample.js` needed the five new nodes added by hand (its own
  coverage test requires every palette type instantiated) and got a small
  unwired-generators column plus two demo wires.
- Verified live: headless Chromium against the real dev stack (throwaway
  ports 4330/5330, throwaway DATA_ROOT), three project networks (Clouds→Tint,
  Gradient→Reframe→Feedback, Shape→Blur→Tint) plus a deliberate cyclic-wire
  probe (Reframe↔Feedback, no generator feeding it). Screenshots and findings
  are in the PR body. One real finding: Feedback's existing "Keep brightest"
  mode against a static input converges to a fixed picture within ~2 frames
  and then two frames a second apart are bit-identical — correct behaviour of
  code that already existed, not a defect in the new operators.
- Wiki: `picture-operators-and-the-desk` article got a new paragraph naming
  all five, `updated` bumped to 2026-09-20.

Tests: `npx vitest run src/project src/raw src/map src/copyVocabulary.test.js
src/styles scripts/nodeAnatomy.test.js src/nodeLabelVocabulary.test.js` — 129
files, 1875 tests, all passing. `npm run lint` and `npm run build` clean.

Not verified: a real GPU (this session only had SwiftShader/headless
Chromium — ~60fps there is a floor, not a claim), a real projector.
