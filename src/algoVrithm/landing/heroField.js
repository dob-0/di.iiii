// The front door's picture: the piece's own shaders, on a bare WebGL context.
//
// Not three.js and not @react-three/fiber. This page is the door to a lazy
// route and must not pull 1.6 MB of renderer for somebody who has not decided
// to come in — the same rule beatCards.js keeps for the edit list, and the
// reason beatSketches.js existed at all.
//
// What changed is the honesty of the drawing, not the rule. The old sketches
// approximated a metaball with radial gradients and an iridescent fluid with a
// three-stop gradient, because canvas2d has no per-pixel. Four of this piece's
// seven mechanisms ARE per-pixel fields — an exponential smooth minimum, a
// domain-warped fbm, a tent-filtered ramp, a 1-dot(n,v) limb — so the only way
// to show them is to evaluate them, which is what a fragment shader is.
//
// Everything below that carries a number is COPIED from the sequence it comes
// from, never invented here, and the copies are kept honest the same way the
// pulse already is: by a test that reads both files. See heroField.test.js.
//
// COLOUR SPACE. The whole shader works in LINEAR light and converts once, at
// the last line, exactly as three does — every hex constant is converted on the
// way in by srgbToLinear() below. The one thing that must be linear is the iris
// ramp: IRIS_RAMP's entries are quieten() mixes that palette.js performs in
// linear space, and interpolating them in sRGB puts the ramp somewhere else.

// ---- the piece's constants, copied ----------------------------------------

// WhiteTunnel.jsx. The piece's one heartbeat; Halo and the poster share it.
const STROBE_HZ = 0.85
const STROBE_SHARPNESS = 2

// MetaballField.jsx — the merge, and the physics under it.
const SMOOTH_K = 2.4
const PAIR_COUNT = 9
const ORBIT_RADIUS = 2.9
const ORBIT_HEIGHT = 1.6
const ORBIT_RATE = 0.35
const BALL_RADIUS = 0.5
const ATTRACTION = 1.9
const REPULSION = 0.382
const SEPARATION_START = 1.15
const SEPARATION_MIN = 0.12
const PHYSICS_STEP = 1 / 240
const APPROACH_START = 0.62
const PORTAL_START = 0.78
const EXIT_START = 0.9
const APPROACH_RADIUS = 1.55
const APPROACH_BALL_RADIUS = 1.15
const PORTAL_MAX_ANGLE = 0.62
const PORTAL_EDGE = 0.05
const PHASE_SEED = 20260730

// ReelGlobe.jsx — the feed's pace, and its runaway.
const SWIPE_START = 0.225
const SWIPE_DURATION = 0.42
const SWIPE_HOLD = 1.15
const SWIPE_CYCLE = SWIPE_HOLD + SWIPE_DURATION
const HOLD_FRACTION = SWIPE_HOLD / SWIPE_CYCLE
const ACCEL_START = 0.721
const ACCEL_HALVING = 0.9
const ACCEL_CHAOS_SPAN = 0.146
const MIN_CYCLE = 0.03
const REEL_WINDOW_SEC = 22.2
const REEL_EXIT_START = 0.854

// DispersionSphere.jsx — the monument.
const SOURCE_PERIODS = [41, 27, 19]
const STROBE_WINDOW = [0.42, 0.74]
const STROBE_RUNS = 3
const STROBE_DECAY = 4.2
const COLUMN_COUNT = 8

// dispersionControls.js defaults, EXCEPT `spectrum`, which is 1 in the piece
// and 0 here. That knob is an authored breach of the colour law — palette.js
// holds the work to two hue bands and a seamless rainbow walks through all the
// gaps between them. The piece is allowed the exception on the artist's brief;
// the front door is not, because nothing on this page has been consented to.
// At 0 it is the same motion inside the palette, which is what IRIS_RAMP is for.
const FLUID_SPEED = 0.35
const FLUID_SCALE = 1.4
const TURBULENCE = 0.85
const BLOOM = 0.8
const HALO_TINT = 0.18
const SPHERE_RADIUS = 5.5
const SPHERE_SEAT = [0, 7.875, -15]

// The door's own, and the only camera number on this page. See M_SPHERE: the
// monument's top edge is 41.7° above a level gaze and this frame reaches 36°.
// 16° of pitch centres it with room to spare on both edges.
const SPHERE_PITCH = 0.28

// AlgoVrithmExperience.jsx. The door looks through the piece's own lens.
const FOV_DEG = 72

const MAX_STEP_SEC = 0.25

// The one frame the page holds on under prefers-reduced-motion. NOT zero: at
// t=0 the corridor's fade-in is still at zero and the piece opens on black, so
// the current page shows a reduced-motion visitor an empty rectangle. 3.2s is
// the corridor at full rush, before the mouth starts moving — the work's
// opening image, and in the black-and-white register 44 of its 53 seconds are in.
export const HOLD_FRAME_SEC = 3.2

// ---- colour ---------------------------------------------------------------
//
// Every hex here passes palette.js's own paletteWarning(). Stated per colour:
//
//   #E9F1F5  TUNNEL_WHITE.ring — hue 200, sat 0.38, val 0.937.  pass
//   #F2EFEA  PALETTE.offWhite  — hue 38,  sat 0.24, val 0.933.  pass
//   #0D1114  PALETTE.void      — hue 206, sat 0.21, val 0.065.  pass
//   #18212A  the colonnade's stone (DispersionSphere).          pass
//   #0A0E12  the colonnade's floor (DispersionSphere).          pass
//   #000000  true black — neutral, exempt from the hue check.   pass
//   IRIS_RAMP, all twelve entries — resolved below.             pass
//
// TWO SUBSTITUTIONS, both toward the palette and both worth stating.
//
// The white-world beats (test pattern, metaball) use #FFFFFF in the piece, and
// #FFFFFF FAILS paletteWarning as 'too-white' — palette.js keeps DATA_WHITE out
// of every checked set precisely so the exception is named rather than smuggled.
// The door uses TUNNEL_WHITE.ring as its paper instead. In the piece the pure
// white is defensible: it is signal on a black world seen by a dark-adapted eye
// in a headset. On a monitor in a lit room it is a blowout, and the palette's
// own rule 4 says to brighten within the hue rather than reach for white.
//
// The reel globe's world is '#04050A', which also FAILS — hue 230, in the purple
// gap. The door uses true black. Worth raising against the piece itself.
const HEX = {
    white: '#E9F1F5',
    calm: '#F2EFEA',
    void: '#0D1114',
    stone: '#18212A',
    floor: '#0A0E12'
}

// IRIS_RAMP, resolved. palette.js builds these with quieten(), which lerps
// toward PALETTE.void through THREE.Color — i.e. in LINEAR space — so they
// cannot be recomputed here without three. They are the printed output of that
// chain and heroField.test.js asserts they still match, the same contract the
// pulse constants are held to.
const IRIS_RAMP = [
    '#79858B', '#7592A8', '#5F92B8', '#7592A8', '#79858B', '#0D1114',
    '#AB8C71', '#B47768', '#9C7F7F', '#B47768', '#AB8C71', '#0D1114'
]

const srgbToLinear = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((byte) => {
        const c = byte / 255
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
}

// ---- the shaders ----------------------------------------------------------

const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`

// Shared by all seven. The noise chain is DispersionSphere.jsx's, verbatim
// including the 2.02 and 2.03 lacunarities — an exact doubling lands every
// octave on the same lattice and the sum grows a visible grid.
const PRELUDE = `
precision highp float;

uniform vec2 uResolution;
uniform float uLocal;
uniform float uMotion;
uniform float uPulse;
uniform float uAlpha;
uniform vec3 uWhite;
uniform vec3 uVoid;
uniform vec3 uPaper;

const float PI = 3.14159265359;
const float TAN_HALF = ${Math.tan((FOV_DEG * Math.PI) / 360).toFixed(6)};

vec2 gPlane;
vec3 gDir;
float gRr;
float gPix;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
            mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z);
}

float fbm(vec3 p) {
    float amplitude = 0.5;
    float sum = 0.0;
    for (int i = 0; i < 4; i++) {
        sum += amplitude * noise(p);
        p *= 2.02;
        amplitude *= 0.5;
    }
    return sum;
}

float turbulence(vec3 p) {
    float amplitude = 0.5;
    float sum = 0.0;
    for (int i = 0; i < 3; i++) {
        sum += amplitude * abs(noise(p) * 2.0 - 1.0);
        p *= 2.03;
        amplitude *= 0.5;
    }
    return sum;
}

// LightHaze.jsx's falloff. The squaring is the whole effect: it pushes the
// falloff out into the tail, so a point source has no perceptible boundary.
float hazeFall(float d) {
    float t = 1.0 - clamp(d, 0.0, 1.0);
    float s = t * t * (3.0 - 2.0 * t);
    return s * s;
}

// Slab test. rd components can be zero, and a division by zero in GLSL ES is
// undefined rather than infinite, so the sign-preserving epsilon is not
// decoration.
vec2 boxHit(vec3 ro, vec3 rd, vec3 c, vec3 h) {
    vec3 inv = 1.0 / (sign(rd) * max(abs(rd), vec3(1e-6)));
    vec3 t0 = (c - h - ro) * inv;
    vec3 t1 = (c + h - ro) * inv;
    vec3 lo = min(t0, t1);
    vec3 hi = max(t0, t1);
    return vec2(max(max(lo.x, lo.y), lo.z), min(min(hi.x, hi.y), hi.z));
}

void setupRay() {
    vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    gPlane = vec2(ndc.x * uResolution.x / uResolution.y, ndc.y) * TAN_HALF;
    gDir = normalize(vec3(gPlane, -1.0));
    gRr = length(gPlane);
    // One pixel, in tan units. Every antialiased edge below is expressed
    // against this instead of fwidth(), which is an extension in WebGL 1.
    gPix = 2.0 * TAN_HALF / uResolution.y;
}

vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void emit(vec3 colour) { gl_FragColor = vec4(toSrgb(colour), uAlpha); }
`

// ---- 01 the corridor ------------------------------------------------------
//
// Analytic, not raymarched, and the corridor is the one geometry where that is
// exact: a ray at angle r off the axis meets a cylinder of radius R at depth
// R/r, so screen radius and depth are a bijection and every pixel knows where
// it is. The eight LED runs fall out of the same fact — a strip 0.05m wide on a
// 2.7m wall subtends 0.0093 rad at EVERY depth, which is why they converge.
const M_TUNNEL = `${PRELUDE}
void main() {
    setupRay();

    float lit = smoothstep(0.0, 0.14, uLocal) * (1.0 - smoothstep(0.6, 1.0, uLocal));
    float crush = smoothstep(0.86, 1.0, uLocal);
    lit *= pow(1.0 - crush, 2.0);

    float speed = 6.0 + smoothstep(0.0, 1.0, uLocal) * 22.0;
    float rr = max(gRr, 1e-4);
    float d = 2.7 / rr;
    // Undo the crush to find where this wall point sits in the corridor's own
    // material. The collapse plane travels out to -1.2m as it closes.
    float d0 = (d - 1.2 * crush) / max(1.0 - crush, 1e-3);

    vec3 col = vec3(0.0);

    if (d0 > 0.2 && d0 < 96.0) {
        float dPerPix = (d / rr) * gPix;
        float wash = 1.0 - smoothstep(7.0, 38.0, d);
        float run = 96.0 - 44.0 - d0 - uMotion * speed;

        float ph = fract(run / 1.846154);
        float gap = min(ph, 1.0 - ph) * 1.846154;
        float ring = 1.0 - smoothstep(0.06, 0.06 + max(dPerPix, 1e-4), gap);
        col += uWhite * ring * (0.9 + uPulse * 1.1) * wash;

        float a = atan(gPlane.y, gPlane.x);
        float slice = PI * 0.25;
        float k = floor(a / slice + 0.5);
        float wedge = abs(a - k * slice);
        float strip = 1.0 - smoothstep(0.00943, 0.00943 + gPix / rr, wedge);
        float along = fract((run - fract(k / 8.0) * 8.0) / 8.0) * 8.0;
        strip *= 1.0 - smoothstep(5.0, 5.0 + dPerPix, along);
        col += uWhite * strip * (0.6 + uPulse * 0.7) * wash;
    }

    // The throat. step(34, d) is the corridor occluding it: past the aperture
    // the wall is nearer than the glow, so the light is masked to exactly the
    // shape of the opening without a mask being drawn.
    float glow = hazeFall(rr / (9.0 / 34.0)) * 0.55 + hazeFall(rr / (3.25 / 34.0)) * 0.75;
    col += uWhite * glow * (0.7 + uPulse * 0.3) * step(34.0, d);

    col *= lit;

    // The mouth. Accelerating the whole way (MOUTH_EASE 2.6), landing at 0.86,
    // and the bang decays cubed so the spike is over in a fifth of the crush.
    float approach = pow(clamp((uLocal - 0.42) / 0.44, 0.0, 1.0), 2.6);
    float mouthR = 2.7 / (48.0 + (0.12 - 48.0) * approach);
    float inside = 1.0 - smoothstep(mouthR - gPix, mouthR + gPix, rr);
    float impact = uLocal < 0.86 ? 0.0 : pow(1.0 - crush, 3.0);
    col = mix(col, uWhite * impact * 0.75, inside * smoothstep(0.42, 0.52, uLocal));

    emit(col);
}
`

// ---- 01b the halo ---------------------------------------------------------
//
// SEEN FROM ABOVE, and that is a declaration rather than a cheat. Halo.jsx's
// own note: a ring whose plane passes near the eye line renders as a band, so
// the ripples run on two horizontal sheets and "looking down or up shows true
// expanding circles while level gaze gets two thin horizons". A flat forward
// frame is the one view of this beat that has nothing in it. So the door takes
// the view that does: straight down at the floor sheet.
//
// NOT from the visitor's own 1.54m, though, which is what this shader was
// written with and which made the beat draw BLACK for its whole four seconds.
// A ring of world radius R on a sheet h below the eye lands at screen tan R/h,
// and the piece's rings are born at 1.2m and die at 20m. From 1.54m even a
// NEWBORN ring is at tan 0.78, and this frame's half-height is tan 36° = 0.727
// — so every ring in the beat was born already outside the frame and only ever
// got further out. In the headset that geometry is right because the visitor
// looks down and the ring is around their feet; a fixed forward-ish frame has
// no such freedom, so the door stands further off the sheet.
//
// 20m is RING_DEAD, chosen so the life of a ring is exactly the life of the
// picture: born at tan 0.06 near the centre, crossing the frame edge as it
// dissolves. Every other number in this beat is the piece's.
const HALO_EYE_HEIGHT = 20.0
const M_HALO = `${PRELUDE}
void main() {
    setupRay();

    float env = smoothstep(0.0, 0.16, uLocal) * (1.0 - smoothstep(0.7, 1.0, uLocal));
    float period = 1.0 / ${STROBE_HZ};
    float acc = 0.0;

    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float cycles = floor((uMotion / period - fi) / 8.0);
        float life = (uMotion - (fi + cycles * 8.0) * period) / 3.6;
        if (life < 0.0 || life >= 1.0) continue;
        // Sub-linear ease: the wavefront decelerates, so it reads as a wave
        // losing energy rather than as an object flying away.
        float radius = 1.2 + 18.8 * pow(life, 0.72);
        float tube = 0.02 * radius / ${HALO_EYE_HEIGHT.toFixed(1)};
        float band = 1.0 - smoothstep(tube, tube + gPix, abs(gRr - radius / ${HALO_EYE_HEIGHT.toFixed(1)}));
        acc += band * pow(1.0 - life, 1.5) * (1.0 - smoothstep(6.0, 26.0, radius));
    }

    emit(uWhite * acc * (0.55 + 0.45 * uPulse) * env);
}
`

// ---- 02 the scan ----------------------------------------------------------
//
// Screen x is f*tan(theta) whatever shell a bar is on, and its width scales
// with radius, so the barcode is depth-INDEPENDENT and reproduces exactly. Only
// the heights carry depth (h*cos(a)/2R), which with the value ladder is all the
// depth an unfogged additive field gets.
//
// One departure, stated: the bars sit on a 1024-step azimuth lattice with
// hashed occupancy rather than at continuous random angles. GLSL ES 1.0 has no
// integer operations, so ScanField's Math.imul avalanche cannot be ported and
// the draw is a different draw of the same distribution. At 1024 steps the
// quantisation is under a pixel, and arguably it is more Ikeda than less.
const M_SCAN = `${PRELUDE}
void main() {
    setupRay();

    float env = smoothstep(0.02, 0.18, uLocal) * (1.0 - smoothstep(0.85, 1.0, uLocal));
    float emerge = smoothstep(0.05, 0.3, uLocal);
    float a = atan(gPlane.x);
    float ca = cos(a);
    float tick = uMotion * 6.0;
    // Sawtooth, not a sine: a scan starts at one end and crosses at a constant
    // rate. A sine slows at each end and turns around, which is a pendulum.
    float sweepY = -2.5 + fract(uLocal * 3.0) * 9.0;
    float slice = 2.0 * PI / 1024.0;
    float k0 = floor(a / slice);
    float acc = 0.0;

    for (int s = 0; s < 4; s++) {
        float fs = float(s);
        float R = s == 0 ? 5.5 : (s == 1 ? 9.0 : (s == 2 ? 14.5 : 21.0));
        // pow(random(), 0.55) over four shells, integrated: the far shells get
        // more bars so the density looks even round a bigger circle.
        float occ = s == 0 ? 0.036 : (s == 1 ? 0.091 : (s == 2 ? 0.139 : 0.183));
        float depth = mix(1.0, 0.34, fs / 3.0);

        for (int j = -1; j <= 1; j++) {
            float k = k0 + float(j);
            if (hash(vec3(k, fs * 7.0, 11.0)) > occ) continue;

            float pickW = hash(vec3(k, fs * 7.0, 23.0));
            float w0 = pickW < 0.3333 ? 0.014 : (pickW < 0.6667 ? 0.035 : 0.085);
            float bh = 2.2 + hash(vec3(k, fs * 7.0, 37.0)) * 5.3;
            float centre = -0.4 + hash(vec3(k, fs * 7.0, 53.0)) * 1.6;

            float aBar = (k + 0.5) * slice;
            float halfW = 0.5 * w0 / (5.5 * ca * ca);
            float hit = 1.0 - smoothstep(halfW, halfW + gPix, abs(gPlane.x - tan(aBar)));
            float halfH = bh * ca / (2.0 * R);
            hit *= 1.0 - smoothstep(halfH, halfH + gPix, abs(gPlane.y - centre * ca / R));
            if (hit <= 0.0) continue;

            // One clock for the whole field, gated by contiguous wedges, so a
            // tick lights blocks of the barcode rather than scattered bars.
            float sector = floor(fract(aBar / (2.0 * PI)) * 24.0);
            float skew = hash(vec3(k, fs * 7.0, 71.0)) * 0.35;
            float live = step(hash(vec3(sector, floor(tick + skew), 3.0)), 0.42);
            float swept = step(abs(centre - sweepY), 0.9);
            float base = swept > 0.5 ? 1.0 : (live > 0.5 ? 0.55 : 0.06);
            float birth = hash(vec3(k, fs * 7.0, 89.0)) * 0.55;
            acc += hit * base * depth * smoothstep(birth, birth + 0.25, emerge);
        }
    }

    emit(uWhite * acc * env);
}
`

// ---- 03 the test pattern --------------------------------------------------
//
// The one beat where the flat frame loses nothing at all, including the moiré:
// 26 ranks on ONE cell grid at different depths, and the interference comes
// from 1/z, which is a divide.
const M_PATTERN = `${PRELUDE}
void main() {
    setupRay();

    float env = smoothstep(0.0, 0.12, uLocal) * (1.0 - smoothstep(0.88, 1.0, uLocal));
    float pace = smoothstep(0.0, 0.14, uLocal) * (1.0 - smoothstep(0.86, 1.0, uLocal));
    // The grid JUMPS between fine and chunky rather than drifting — a grid that
    // eases between sizes is a zoom.
    float cells = 24.0 + floor(hash(vec3(floor(uMotion * 0.85), 991.0, 5.0)) * 72.0);
    float cw = 34.0 / cells;
    float stp = floor(uMotion * 2.6);
    float travelled = uMotion * 0.9 * pace;

    float best = 1e9;
    for (int rank = 0; rank < 26; rank++) {
        float fr = float(rank);
        float D = 32.4 - mod(fr * 2.4 + travelled, 62.4);
        if (D < 0.25 || D > best) continue;
        float Y = 1.6 + gPlane.y * D;
        float band = Y > 1.42 ? 0.0 : 1.0;
        if (Y > (band < 0.5 ? 6.4 : 1.35)) continue;
        if (Y < (band < 0.5 ? 1.49 : -3.6)) continue;
        float cell = floor((gPlane.x * D + 17.0) / cw);
        // THE LANE, measured to the slab's inner edge. Nothing may reach the
        // standpoint, and nothing has to be culled next to it either.
        if (abs(-17.0 + (cell + 0.5) * cw) - cw * 0.5 < 0.7) continue;
        // The rank is folded into the hash. Identical ranks would line up into
        // corridors of slab, and the moiré comes from them NOT agreeing.
        if (hash(vec3(cell - stp * (band < 0.5 ? 1.0 : -1.0) + fr * 131.0, band, 5.0)) >= 0.2) continue;
        best = D;
    }

    if (best > 1e8) { emit(uPaper); return; }
    emit(mix(uPaper, mix(vec3(0.0), uPaper, smoothstep(7.0, 26.0, best)), env));
}
`

// ---- 04 the merge ---------------------------------------------------------
//
// MetaballField.jsx's fragment shader, and the only changes are that the ray
// origin is the standpoint rather than a per-eye camera, and the world is the
// door's paper. pairField() is kynd's smoothen() with the level set at 0.
const M_METABALL = `${PRELUDE}
uniform vec4 uBallA[${PAIR_COUNT}];
uniform vec4 uBallB[${PAIR_COUNT}];
uniform float uPortalCos;
uniform float uInk;

float pairField(vec3 p, vec4 a, vec4 b) {
    float da = length(p - a.xyz) - a.w;
    float db = length(p - b.xyz) - b.w;
    return -log(exp(-${SMOOTH_K} * da) + exp(-${SMOOTH_K} * db)) / ${SMOOTH_K};
}

void main() {
    setupRay();

    vec3 ro = vec3(0.0, 1.6, 0.0);
    float best = 1e9;
    float bestT = 0.0;

    for (int pair = 0; pair < ${PAIR_COUNT}; pair++) {
        vec4 a = uBallA[pair];
        vec4 b = uBallB[pair];
        vec3 centre = (a.xyz + b.xyz) * 0.5;
        // The bound is what makes this affordable. Do NOT merge the pairs into
        // one field: that turns every pixel into an 18-source march.
        float bound = length(a.xyz - b.xyz) * 0.5 + a.w + 0.45;
        vec3 toCentre = ro - centre;
        float halfB = dot(toCentre, gDir);
        float disc = halfB * halfB - (dot(toCentre, toCentre) - bound * bound);
        if (disc < 0.0) continue;
        float root = sqrt(disc);
        float tExit = -halfB + root;
        if (tExit <= 0.0) continue;
        float t = max(-halfB - root, 0.0);

        for (int marchStep = 0; marchStep < 24; marchStep++) {
            if (t > tExit) break;
            float d = pairField(ro + gDir * t, a, b);
            if (d < best) { best = d; bestT = t; }
            if (d < 0.0) break;
            t += max(d, 0.04);
        }
    }

    // Angular, so a blob at 2m and one at 4m are equally soft on screen.
    float alpha = 1.0 - smoothstep(0.0, 0.006 * max(bestT, 0.5), best);
    // A LARGER hole is a SMALLER cosine, so the portal opens as uPortalCos falls.
    alpha *= 1.0 - smoothstep(uPortalCos, uPortalCos + ${PORTAL_EDGE}, dot(gDir, vec3(0.0, 0.0, -1.0)));

    vec3 ink = mix(vec3(0.0), uPaper, smoothstep(2.2, 11.0, bestT));
    emit(mix(uPaper, ink, alpha * uInk));
}
`

// ---- 05 the feed ----------------------------------------------------------
//
// THE DOOR DOES NOT SHOW THE FOOTAGE, and that is the honest call rather than a
// shortfall. The beat is 30 mp4s; bringing them to a landing page is several
// megabytes on a page whose whole design is that it costs nothing, and drawing
// coloured rectangles instead is the lie the old sketch told.
//
// What it shows is the beat's architecture, which is real and is the piece's:
// 8 x 28 watertight cells on a lat/long grid at COLS = 3.56 * ROWS, so every
// equatorial cell is a 9:16 frame; the whole room swiping in unison because it
// is one feed; and the runaway, with the hold fraction driven to zero so the
// feed SLIDES rather than cutting. That last is a safety property, not a look.
//
// The step out is exact. The shell is solved as an actual sphere shrinking from
// radius 7 at the eye to 5.5 at the dispersion sphere's own seat, so the moment
// the near wall sweeps past the eye is the real moment.
const M_GLOBE = `${PRELUDE}
uniform float uSlot;
uniform float uHold;
uniform float uChaos;
uniform float uExit;

void main() {
    setupRay();

    float env = smoothstep(0.02, 0.12, uLocal) * (1.0 - smoothstep(0.898, 1.0, uLocal));
    vec3 ro = vec3(0.0, 1.6, 0.0);
    vec3 C = vec3(0.0, mix(1.6, ${SPHERE_SEAT[1]}, uExit), mix(0.0, ${SPHERE_SEAT[2]}.0, uExit));
    float R = 7.0 * (1.0 + (${SPHERE_RADIUS} / 7.0 - 1.0) * uExit);

    vec3 oc = ro - C;
    float halfB = dot(oc, gDir);
    float disc = halfB * halfB - (dot(oc, oc) - R * R);
    if (disc < 0.0) { emit(vec3(0.0)); return; }
    float root = sqrt(disc);
    float tNear = -halfB - root;
    vec3 n = normalize(ro + gDir * (tNear > 0.0 ? tNear : -halfB + root) - C);

    float polar = acos(clamp(n.y, -1.0, 1.0));
    // atan(x, z), matching vertexAt(): x = R sin(polar) sin(azimuth).
    float row = polar / PI * 8.0;
    float col = fract(atan(n.x, n.z) / (2.0 * PI)) * 28.0;
    float u = fract(col);
    float v = 1.0 - fract(row);

    // Slot i's next clip is slot i+1's current one, so a swipe costs nothing.
    float slot = floor(row) * 28.0 + floor(col);
    float pos = uSlot + uChaos * hash(vec3(slot, 3.0, 61.0));
    float phase = pos - floor(pos);
    float swipe = phase <= uHold ? 0.0 : smoothstep(uHold, 1.0, phase);

    float vv = v - swipe;
    float plate = hash(vec3(slot + floor(pos) + (vv >= 0.0 ? 0.0 : 1.0), 7.0, 13.0));
    float vIn = vv >= 0.0 ? vv : vv + 1.0;

    // The tiling itself: adjacent cells share their corners exactly, so this is
    // one surface cut into frames rather than panels hoped to line up.
    float cellPix = gPix * 28.0 / (2.0 * PI) / max(sin(polar), 0.15);
    float seam = 1.0 - smoothstep(cellPix, cellPix * 3.0, min(min(u, 1.0 - u), min(vIn, 1.0 - vIn)));

    // A flat grey per frame renders the beat as tiling — 24 plain squares, a
    // tiled wall and not a feed. Each plate carries a vertical gradient with its
    // own direction and one bright band across it, which is the least that reads
    // as an image inside a frame without inventing footage the piece has not
    // got. The band is where a face or a horizon lands in almost every reel.
    float grain = hash(vec3(slot + floor(pos), 19.0, 5.0));
    float lean = mix(vIn, 1.0 - vIn, step(0.5, grain));
    float band = smoothstep(0.08, 0.42, vIn) * (1.0 - smoothstep(0.52, 0.92, vIn));
    float image = plate * (0.5 + 0.5 * lean) + band * 0.22 * grain;

    // The shell is a shell. The poles sit further from the eye than the equator
    // does, and without that the curvature is carried by the seams alone.
    float depth = 0.55 + 0.45 * sin(polar);

    emit(uWhite * (0.08 + image * 0.54 + seam * 0.5) * depth * env);
}
`

// ---- 06 the monument ------------------------------------------------------
//
// DispersionSphere.jsx's fragment shader, near enough line for line: the domain
// warp, the turbulence folded at zero, the deep sample, the three geodesic
// sources on periods with no common factor, the tent-filtered ramp, the
// dissolve and the limb. The shells keep their -dot(n,v) — fresnel was the
// reflex and it is wrong for a halo, because it peaks at the shell's OWN
// silhouette and paints two hard rings.
const M_SPHERE = `${PRELUDE}
uniform vec3 uSourceA;
uniform vec3 uSourceB;
uniform vec3 uSourceC;
uniform float uFluid;
uniform vec3 uRamp[12];
uniform vec3 uCalm;
uniform vec3 uLamp;
uniform vec3 uStone;
uniform vec3 uFloorCol;
uniform float uColumn[${COLUMN_COUNT}];

// Tent filter, not an indexed lookup: GLSL ES only guarantees constant indexing
// into uniform arrays. Width 1, so only two neighbours contribute — which is
// exactly the property IRIS_RAMP is ordered for.
vec3 sampleRamp(float t) {
    float x = fract(t) * 12.0;
    vec3 acc = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < 12; i++) {
        float d = abs(x - float(i));
        d = min(d, 12.0 - d);
        float w = max(0.0, 1.0 - d);
        w = w * w * (3.0 - 2.0 * w);
        acc += uRamp[i] * w;
        total += w;
    }
    return acc / max(total, 0.0001);
}

void main() {
    setupRay();

    // AIMED, and it has to be. The sphere sits at 7.875 on a seat 15m back, so
    // from the eye at 1.6 its centre is 22.7° up and its top edge 41.7° up —
    // past this frame's 36° half-height. A level gaze decapitates the monument
    // and fills the bottom third with empty floor, which is what it did. The
    // visitor in the headset looks up; a fixed frame has to be pointed.
    //
    // The whole RAY is pitched rather than the sphere moved: the floor, the
    // colonnade and the shells then agree, because this is a camera being aimed
    // and not one object being nudged into shot.
    float cp = cos(${SPHERE_PITCH.toFixed(3)});
    float sp = sin(${SPHERE_PITCH.toFixed(3)});
    gDir = normalize(vec3(gDir.x, gDir.y * cp - gDir.z * sp, gDir.y * sp + gDir.z * cp));

    float env = smoothstep(0.04, 0.3, uLocal) * (1.0 - smoothstep(0.9, 1.0, uLocal));
    vec3 ro = vec3(0.0, 1.6, 0.0);
    vec3 C = vec3(0.0, ${SPHERE_SEAT[1]}, ${SPHERE_SEAT[2]}.0);
    float R = ${SPHERE_RADIUS};

    vec3 col = uVoid;
    float depth = 1e9;

    // The floor. Its only job is to be a surface at a known distance for the
    // sphere's colour to fall off across — without something to fall off ON,
    // "monumental" has no reference.
    if (gDir.y < -0.001) {
        vec3 hit = ro + gDir * (-ro.y / gDir.y);
        float reach = length(hit - vec3(C.x, 0.0, C.z));
        col = mix(uFloorCol, uLamp, 0.55 / (1.0 + reach * reach * 0.035));
        depth = length(hit - ro);
    }

    // The colonnade, and the wall behind it.
    vec2 wall = boxHit(ro, gDir, vec3(0.0, 10.0, ${SPHERE_SEAT[2]}.0 - 26.0), vec3(35.0, 10.0, 0.5));
    if (wall.x > 0.0 && wall.x < wall.y && wall.x < depth) { col = uStone; depth = wall.x; }

    for (int i = 0; i < ${COLUMN_COUNT}; i++) {
        float fi = float(i);
        vec3 c = vec3((mod(fi, 2.0) * 2.0 - 1.0) * 9.5, 9.0, ${SPHERE_SEAT[2]}.0 + 8.0 - floor(fi / 2.0) * 9.0);
        vec2 h = boxHit(ro, gDir, c, vec3(0.8, 9.0, 0.8));
        if (h.x > 0.0 && h.x < h.y && h.x < depth) {
            // White, on direction: the work opens on a white pulse in a dark
            // corridor and closes on the same pulse in a dark colonnade.
            col = uStone + uWhite * uColumn[i] * 2.4;
            depth = h.x;
        }
    }

    // The sphere.
    vec3 oc = ro - C;
    float halfB = dot(oc, gDir);
    float disc = halfB * halfB - (dot(oc, oc) - R * R);
    if (disc > 0.0) {
        float tS = -halfB - sqrt(disc);
        if (tS > 0.0 && tS < depth) {
            vec3 hit = ro + gDir * tS;
            vec3 dir = (hit - C) / R;
            vec3 view = normalize(ro - hit);
            vec3 p = dir * ${FLUID_SCALE};

            // Noise sampled at coordinates that are themselves noise. This one
            // line is most of the difference between pigment in water and a
            // cloud texture; the three axes are offset by unrelated constants
            // so they cannot fold into a symmetry.
            vec3 warp = vec3(
                fbm(p + vec3(0.0, 1.7, 4.2) + uFluid * 0.071),
                fbm(p + vec3(5.2, 1.3, 2.8) - uFluid * 0.054),
                fbm(p + vec3(2.9, 4.1, 0.7) + uFluid * 0.043));
            float fluid = fbm(p + (1.4 + ${TURBULENCE} * 0.9) * warp);
            fluid += turbulence(p * 2.05 + warp * 1.2 + vec3(0.0, 0.0, uFluid * 0.06)) * ${TURBULENCE} * 0.32;
            float deep = noise((dir - view * 0.22) * ${FLUID_SCALE} * 0.8 + warp - uFluid * 0.02);
            fluid = mix(fluid, deep, 0.22);

            // acos of the dot is the geodesic angle, so subtracting time makes
            // rings that TRAVEL away from each source rather than blink in place.
            float aA = acos(clamp(dot(dir, uSourceA), -1.0, 1.0));
            float aB = acos(clamp(dot(dir, uSourceB), -1.0, 1.0));
            float aC = acos(clamp(dot(dir, uSourceC), -1.0, 1.0));
            float field = fluid
                + 0.34 * sin(aA * 3.1 - uFluid * 0.83) * exp(-aA * 0.55)
                + 0.26 * sin(aB * 4.3 - uFluid * 0.61) * exp(-aB * 0.7)
                + 0.19 * sin(aC * 5.7 - uFluid * 0.44) * exp(-aC * 0.85);

            vec3 skin = sampleRamp(field * 0.78 + uFluid * 0.021);
            // Letting patches drain is what makes the colour read as something
            // IN a medium rather than as a painted ball.
            skin *= smoothstep(-0.05, 0.95, field + 0.3);
            float fres = pow(1.0 - max(dot(dir, view), 0.0), 2.4);
            col = skin + skin * fres * 0.9;
            depth = tS;
        }
    }

    // Two additive shells, back half only — so the sphere's own depth clips the
    // halo to exactly the annulus outside its silhouette.
    for (int i = 0; i < 2; i++) {
        float Rs = R * (i == 0 ? 1.15 : 1.42);
        float b = dot(ro - C, gDir);
        float d2 = b * b - (dot(ro - C, ro - C) - Rs * Rs);
        if (d2 <= 0.0) continue;
        float tf = -b + sqrt(d2);
        if (tf <= 0.0 || depth < tf) continue;
        vec3 hit = ro + gDir * tf;
        vec3 nn = (hit - C) / Rs;
        float through = pow(max(-dot(nn, normalize(ro - hit)), 0.0), 1.6);
        // One octave at a LOWER frequency than the surface: a blur approximated
        // by not asking for the detail in the first place.
        float halo = noise(nn * ${FLUID_SCALE} * 0.55 + vec3(0.0, 0.0, uFluid * 0.03));
        // Drained toward the near-white. A coloured halo round a coloured
        // sphere leaves nothing in the frame for the colour to be read against.
        vec3 hc = mix(uCalm, sampleRamp(halo * 0.9 + uFluid * 0.021), ${HALO_TINT});
        col += hc * through * ${BLOOM} * (i == 0 ? 1.0 : 0.45) * 0.55;
    }

    emit(col * env);
}
`

// Keyed by beatCards.js's own `sketch` names, so the door's edit list needs no
// change and leadBeatAtSec() maps straight across.
const SOURCES = {
    tunnel: M_TUNNEL,
    halo: M_HALO,
    scan: M_SCAN,
    pattern: M_PATTERN,
    metaball: M_METABALL,
    globe: M_GLOBE,
    sphere: M_SPHERE
}

// ---- the physics, verbatim from MetaballField.jsx -------------------------

/**
 * One step of the pair oscillator. Attraction linear, repulsion inverse-square,
 * both on the HALF-separation. It never settles and never collapses, and its
 * swing is not sinusoidal — fast through the merge, slow at the extremes.
 */
export const stepSeparation = (separation, velocity, dt) => {
    const acceleration = -ATTRACTION * separation + REPULSION / (separation * separation)
    let nextVelocity = velocity + acceleration * dt
    let nextSeparation = separation + nextVelocity * dt
    if (nextSeparation < SEPARATION_MIN) {
        nextSeparation = SEPARATION_MIN
        nextVelocity = Math.abs(nextVelocity)
    }
    return { separation: nextSeparation, velocity: nextVelocity }
}

// random.js's generator, copied for the same reason the pulse is.
const createRandom = (seed) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (a, b, v) => {
    if (a === b) return v >= b ? 1 : 0
    const t = clamp01((v - a) / (b - a))
    return t * t * (3 - 2 * t)
}

// ---- the context ----------------------------------------------------------

const compile = (gl, type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        // Not thrown. A shader that will not compile on somebody's driver is a
        // reason to fall back to the 2D poster, not to break the front door.
        gl.deleteShader(shader)
        return null
    }
    return shader
}

const link = (gl, fragmentSource) => {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
    if (!vs || !fs) return null
    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPosition')
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    return { program, uniforms: new Map() }
}

/**
 * The picture, or null if this machine cannot draw it.
 *
 * Null is a normal outcome and the caller must handle it: no WebGL, a blocked
 * context, a driver that refuses one of the seven programs, or a uniform budget
 * under what the metaball march needs. beatSketches.js stays in the tree as the
 * fallback for exactly that.
 */
export const createHeroField = (canvas) => {
    const attributes = { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false }
    const gl = canvas.getContext('webgl', attributes) || canvas.getContext('experimental-webgl', attributes)
    if (!gl) return null

    // GLSL ES 1.0 only guarantees 16 fragment uniform vectors. Every real GPU
    // reports 221 or more, but the metaball march needs 18 for the balls alone,
    // and finding that out as a blank canvas on somebody's phone is worse than
    // finding it out here.
    if (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < 64) return null

    const programs = {}
    for (const [name, source] of Object.entries(SOURCES)) {
        const built = link(gl, source)
        if (!built) return null
        programs[name] = built
    }

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const linear = {
        white: srgbToLinear(HEX.white),
        calm: srgbToLinear(HEX.calm),
        void: srgbToLinear(HEX.void),
        stone: srgbToLinear(HEX.stone),
        floor: srgbToLinear(HEX.floor),
        ramp: IRIS_RAMP.map(srgbToLinear)
    }
    const rampFlat = new Float32Array(linear.ramp.flat())

    // Per-pair state. The phases are seeded so nine pairs are not a mechanism in
    // lockstep, and the stagger spans a full oscillator period (2.67s) so the
    // merges never land together.
    const pairs = (() => {
        const random = createRandom(PHASE_SEED)
        return Array.from({ length: PAIR_COUNT }, (unused, index) => ({
            bearing: (index / PAIR_COUNT) * Math.PI * 2,
            height: (random() - 0.5) * 1.5,
            bob: 0.18 + random() * 0.22,
            bobRate: 0.5 + random() * 0.7,
            tilt: (random() - 0.5) * 1.1,
            separation: SEPARATION_START,
            velocity: 0,
            lead: random() * 2.67
        }))
    })()

    const state = {
        lastPlayhead: null,
        motion: 0,
        pairTime: 0,
        pairsSeeded: false,
        feed: 0,
        ballA: new Float32Array(PAIR_COUNT * 4),
        ballB: new Float32Array(PAIR_COUNT * 4),
        columns: new Float32Array(COLUMN_COUNT),
        lamp: new Float32Array(3)
    }

    const uniform = (entry, name) => {
        if (!entry.uniforms.has(name)) {
            entry.uniforms.set(name, gl.getUniformLocation(entry.program, name))
        }
        return entry.uniforms.get(name)
    }

    const seedPairs = () => {
        if (state.pairsSeeded) return
        state.pairsSeeded = true
        // Run the pairs forward before the first drawn frame, so the beat does
        // not open on eighteen sources sitting still waiting for physics.
        pairs.forEach((pair) => {
            let steps = Math.round(pair.lead / PHYSICS_STEP)
            while (steps-- > 0) {
                const next = stepSeparation(pair.separation, pair.velocity, PHYSICS_STEP)
                pair.separation = next.separation
                pair.velocity = next.velocity
            }
        })
    }

    const advancePairs = (delta) => {
        seedPairs()
        state.pairTime += delta
        // Fixed step, on its own clock: the oscillator is stiff near closest
        // approach and must not depend on the frame rate.
        let remaining = delta
        while (remaining > 0) {
            const step = Math.min(PHYSICS_STEP, remaining)
            pairs.forEach((pair) => {
                const next = stepSeparation(pair.separation, pair.velocity, step)
                pair.separation = next.separation
                pair.velocity = next.velocity
            })
            remaining -= step
        }
    }

    const writeBalls = (local) => {
        const approach = smoothstep(APPROACH_START, 1, local)
        const orbitRadius = ORBIT_RADIUS + (APPROACH_RADIUS - ORBIT_RADIUS) * approach
        const ballRadius = BALL_RADIUS + (APPROACH_BALL_RADIUS - BALL_RADIUS) * approach
        const time = state.pairTime

        pairs.forEach((pair, index) => {
            const bearing = pair.bearing + time * ORBIT_RATE
            const cos = Math.cos(bearing)
            const sin = Math.sin(bearing)
            const cx = cos * orbitRadius
            const cz = sin * orbitRadius
            const cy = ORBIT_HEIGHT + pair.height + Math.sin(time * pair.bobRate + pair.bearing) * pair.bob
            // The pair's axis is the ring's tangent, tilted out of horizontal so
            // each pair merges along a different line.
            const ax = -sin * Math.cos(pair.tilt)
            const ay = Math.sin(pair.tilt)
            const az = cos * Math.cos(pair.tilt)
            const reach = pair.separation
            const o = index * 4
            state.ballA.set([cx + ax * reach, cy + ay * reach, cz + az * reach, ballRadius], o)
            state.ballB.set([cx - ax * reach, cy - ay * reach, cz - az * reach, ballRadius], o)
        })

        const portalOpen = smoothstep(PORTAL_START, 1, local)
        const exit = smoothstep(EXIT_START, 1, local)
        const angle = PORTAL_MAX_ANGLE * portalOpen + (Math.PI - PORTAL_MAX_ANGLE) * exit
        return {
            // The fade-out is CANCELLED once the approach begins: the field is
            // the wall the portal is a hole in, and a wall that fades has no
            // hole in it.
            ink: smoothstep(0, 0.12, local) * Math.max(smoothstep(1, 0.88, local), approach),
            portalCos: Math.cos(angle) - PORTAL_EDGE * exit
        }
    }

    const advanceFeed = (local, delta) => {
        const accelSeconds = Math.max(0, (local - ACCEL_START) * REEL_WINDOW_SEC)
        const cycle = Math.max(MIN_CYCLE, SWIPE_CYCLE * Math.pow(0.5, accelSeconds / ACCEL_HALVING))
        // Integrated, not derived from a modulo: with a shrinking cycle,
        // clock % cycle makes the phase jump backwards every frame.
        if (local >= SWIPE_START) state.feed += delta / cycle
        const chaos = smoothstep(ACCEL_START, Math.min(1, ACCEL_START + ACCEL_CHAOS_SPAN), local)
        return {
            slot: state.feed,
            // Driven to zero as the pace runs away, so flick-and-snap becomes
            // one continuous slide. This is the safety property, not a look:
            // holding the snap while shrinking the cycle would drive the whole
            // field into hard cuts straight through 15-25Hz.
            hold: HOLD_FRACTION * (1 - chaos),
            chaos,
            exit: (() => {
                const u = clamp01((local - REEL_EXIT_START) / (1 - REEL_EXIT_START))
                // Trapezoid, not a smoothstep: a coherent surround translating
                // is read by the inner ear as self-motion, and a trapezoid
                // accelerates once, cruises, and brakes once.
                const a = 0.3
                const total = 1 - a
                if (u <= 0) return 0
                if (u >= 1) return 1
                if (u < a) return (u * u) / (2 * a) / total
                if (u <= 1 - a) return (a / 2 + (u - a)) / total
                return 1 - ((1 - u) * (1 - u)) / (2 * a) / total
            })()
        }
    }

    const writeMonument = (local) => {
        const animated = state.motion * FLUID_SPEED
        const [pa, pb, pc] = SOURCE_PERIODS
        const a = (animated / pa) * Math.PI * 2
        const b = (animated / pb) * Math.PI * 2
        const c = (animated / pc) * Math.PI * 2
        const norm = (v) => {
            const l = Math.hypot(v[0], v[1], v[2]) || 1
            return [v[0] / l, v[1] / l, v[2] / l]
        }

        // The lamp: roughly where the ramp currently sits, drained toward the
        // near-white by the same knob as the halo. 0.021 appears here and in the
        // shader and the two have to be the same number, or the sphere goes one
        // colour while the floor under it stays another.
        const phase = (animated * 0.021) % 1
        const index = phase * 12
        const low = linear.ramp[Math.floor(index) % 12]
        const high = linear.ramp[(Math.floor(index) + 1) % 12]
        const frac = index % 1
        for (let i = 0; i < 3; i++) {
            const room = low[i] + (high[i] - low[i]) * frac
            state.lamp[i] = linear.calm[i] + (room - linear.calm[i]) * HALO_TINT
        }

        const [strobeIn, strobeOut] = STROBE_WINDOW
        const running = local > strobeIn && local < strobeOut
        // Wrapped per column rather than tracked by index, so no column can be
        // skipped when the frame rate dips — a missed flash is far more visible
        // than a late one.
        const head = running ? ((local - strobeIn) / (strobeOut - strobeIn)) * STROBE_RUNS * COLUMN_COUNT : 0
        for (let i = 0; i < COLUMN_COUNT; i++) {
            if (!running) { state.columns[i] = 0; continue }
            let behind = (head - i) % COLUMN_COUNT
            if (behind < 0) behind += COLUMN_COUNT
            state.columns[i] = Math.exp(-behind * STROBE_DECAY)
        }

        return {
            sourceA: norm([Math.cos(a), Math.sin(a * 0.61), Math.sin(a)]),
            sourceB: norm([Math.sin(b * 0.77), Math.cos(b), Math.cos(b * 0.43)]),
            sourceC: norm([Math.cos(c * 0.39), Math.sin(c * 0.83), Math.cos(c)]),
            fluid: animated
        }
    }

    const drawMovement = (entry, name, local, alpha, extra) => {
        gl.useProgram(entry.program)
        gl.uniform2f(uniform(entry, 'uResolution'), canvas.width, canvas.height)
        gl.uniform1f(uniform(entry, 'uLocal'), local)
        gl.uniform1f(uniform(entry, 'uMotion'), state.motion)
        // pow() on a sine shapes the peak without branching. 0.85Hz, and the
        // squaring is what drops the mean to 0.25 — most of the time nearly out,
        // briefly overdriven. Nowhere near the 15-25Hz band.
        gl.uniform1f(uniform(entry, 'uPulse'),
            Math.pow(Math.sin(state.motion * Math.PI * 2 * STROBE_HZ) * 0.5 + 0.5, STROBE_SHARPNESS))
        gl.uniform1f(uniform(entry, 'uAlpha'), alpha)
        gl.uniform3fv(uniform(entry, 'uWhite'), linear.white)
        gl.uniform3fv(uniform(entry, 'uVoid'), linear.void)
        gl.uniform3fv(uniform(entry, 'uPaper'), linear.white)

        if (name === 'metaball') {
            gl.uniform4fv(uniform(entry, 'uBallA[0]'), state.ballA)
            gl.uniform4fv(uniform(entry, 'uBallB[0]'), state.ballB)
            gl.uniform1f(uniform(entry, 'uPortalCos'), extra.portalCos)
            gl.uniform1f(uniform(entry, 'uInk'), extra.ink)
        } else if (name === 'globe') {
            gl.uniform1f(uniform(entry, 'uSlot'), extra.slot)
            gl.uniform1f(uniform(entry, 'uHold'), extra.hold)
            gl.uniform1f(uniform(entry, 'uChaos'), extra.chaos)
            gl.uniform1f(uniform(entry, 'uExit'), extra.exit)
        } else if (name === 'sphere') {
            gl.uniform3fv(uniform(entry, 'uSourceA'), extra.sourceA)
            gl.uniform3fv(uniform(entry, 'uSourceB'), extra.sourceB)
            gl.uniform3fv(uniform(entry, 'uSourceC'), extra.sourceC)
            gl.uniform1f(uniform(entry, 'uFluid'), extra.fluid)
            gl.uniform3fv(uniform(entry, 'uRamp[0]'), rampFlat)
            gl.uniform3fv(uniform(entry, 'uCalm'), linear.calm)
            gl.uniform3fv(uniform(entry, 'uLamp'), state.lamp)
            gl.uniform3fv(uniform(entry, 'uStone'), linear.stone)
            gl.uniform3fv(uniform(entry, 'uFloorCol'), linear.floor)
            gl.uniform1fv(uniform(entry, 'uColumn[0]'), state.columns)
        }

        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    return {
        /**
         * One frame. `live` is beatsAtSec()'s output, unchanged — the door draws
         * from the same edit list it always did.
         *
         * The delta is what everything moves on, so a held playhead is a
         * genuinely held frame: under prefers-reduced-motion nothing here
         * advances by so much as a step of the oscillator.
         */
        draw({ width, height, ratio, elapsed, live }) {
            const target = [Math.round(width * ratio), Math.round(height * ratio)]
            if (canvas.width !== target[0] || canvas.height !== target[1]) {
                canvas.width = target[0]
                canvas.height = target[1]
            }
            gl.viewport(0, 0, canvas.width, canvas.height)

            const last = state.lastPlayhead
            // A wrap at the end of the loop resets the integrators rather than
            // running them backwards — the piece re-mounts its sequences there.
            if (last !== null && elapsed < last) {
                state.feed = 0
                state.pairTime = 0
                state.pairsSeeded = false
                pairs.forEach((pair) => { pair.separation = SEPARATION_START; pair.velocity = 0 })
            }
            const raw = last === null || elapsed < last ? 0 : elapsed - last
            const delta = Math.min(raw, MAX_STEP_SEC)
            state.lastPlayhead = elapsed
            state.motion += delta

            gl.clearColor(0, 0, 0, 1)
            gl.clear(gl.COLOR_BUFFER_BIT)
            if (!live.length) return

            // Strongest first at full strength, the other over it at its weight.
            // The dissolve beatSketches.js had to give up — "a second canvas and
            // a lot of machinery for a poster" — is a blend factor here.
            const ordered = [...live].sort((a, b) => b.weight - a.weight)
            ordered.slice(0, 2).reverse().forEach((entry, index, all) => {
                const beat = entry.beat
                const program = programs[beat.sketch]
                if (!program) return
                const span = Math.max(0.001, beat.endSec - beat.startSec)
                const local = clamp01((elapsed - beat.startSec) / span)

                let extra = null
                if (beat.sketch === 'metaball') {
                    advancePairs(delta)
                    extra = writeBalls(local)
                } else if (beat.sketch === 'globe') {
                    extra = advanceFeed(local, delta)
                } else if (beat.sketch === 'sphere') {
                    extra = writeMonument(local)
                }

                // The last drawn is the strongest, and it carries the weight.
                const alpha = index === all.length - 1 && all.length > 1 ? entry.weight : 1
                drawMovement(program, beat.sketch, local, alpha, extra)
            })
        },

        // NO loseContext(), and that omission is the whole point. StrictMode
        // mounts every effect twice in development — create, dispose, create —
        // and a canvas keeps its context for life. Killing it on the first
        // dispose left the second createHeroField holding a DEAD context, whose
        // programs will not link, so it returned null; and the 2D poster could
        // not take over either, because getContext('2d') on a canvas that has
        // already been handed a WebGL context returns null. The page rendered a
        // blank rectangle with no error anywhere: no exception, no failed
        // request, both renderers silently unavailable.
        //
        // The programs and the buffer are worth releasing. The context is not
        // ours to destroy — it dies with the canvas.
        dispose() {
            Object.values(programs).forEach(({ program }) => gl.deleteProgram(program))
            gl.deleteBuffer(quad)
        }
    }
}
