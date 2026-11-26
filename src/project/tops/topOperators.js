// The image operators — di.iiii's TOPs.
//
// Each operator is data: its inputs, its parameters with defaults and ranges,
// and one fragment shader that turns input textures into its output. The engine
// (topEngine.js) owns every GL object; nothing here touches WebGL, so the
// vocabulary can be read, listed in a palette and tested without a GPU.
//
// Conventions inside a shader:
//   uv            0..1, bottom-up, the whole frame
//   a, b          input textures (black when unwired)
//   self          this operator's own output from the previous frame
//   texel         1 / resolution
//   p_<name>      each parameter, as a float
//
// 8-bit textures and WebGL1 on purpose: this has to run on the oldest GPU that
// will ever be plugged into a projector.
//
// `time` — seconds, float, monotonic from when the engine's canvas was
// created — reaches every fragment as a plain uniform (topEngine.js declares
// it in the shared preamble, next to `a`/`b`/`texel`), so a generator never
// has to ask for it specially. It is passed already wrapped (`mod(t, 3600)`)
// to keep it small: a raw millisecond clock would lose float precision on an
// old GPU's mediump path long before a wall runs a show for an hour, and the
// wrap is invisible to a fragment that only ever reads `sin`/`fract` of it.
//
// An operator whose picture depends on `time` sets `animated: true` — it is
// the only thing that makes ITS OWN redraw depend on the clock rather than on
// its inputs. Nothing to preserve here: the engine already redraws every
// operator, animated or not, on every requestAnimationFrame (see topEngine.js
// — there is no per-operator dirty-tracking to break). The flag is real data
// even so: it is what a reader (or a future scheduler) checks to know an
// operator cannot be treated as static just because its inputs are.

const LUMA = 'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }'

const param = (name, label, value, min, max, step = 0.01) => ({ name, label, value, min, max, step })
// A switch or a menu is still a number to the shader; `options` only changes
// how the inspector draws it.
const toggle = (name, label, value = 0) => ({ name, label, value, min: 0, max: 1, step: 1, toggle: true })
const choice = (name, label, options, value = 0) => ({ name, label, value, min: 0, max: options.length - 1, step: 1, options })
// The smallest honest colour support: a hex string, the same shape the rest
// of the app already stores a colour in (entityRegistry.js, nodeRegistry.js's
// `type: 'color'` fields) and the same box the inspector already draws for
// one. resolveTopParams keeps it as a string; the engine uploads it as a
// vec3 (hexToRgb01) instead of the float every other parameter becomes.
const colour = (name, label, value) => ({ name, label, value, colour: true })
// A short piece of writing — a name on the network, say. It never reaches a
// shader: resolveTopParams keeps it as a string, and the engine only uploads
// a parameter whose `p_<name>` uniform the fragment actually declares
// (topEngine.js: `if (location === null) continue`), so an operator with a
// text param simply does not declare one. Were a fragment ever to declare it,
// gl.uniform1f would be handed a string and quietly upload NaN.
const text = (name, label, value = '') => ({ name, label, value, text: true })
const TEXT_MAX = 200

/** '#rrggbb' -> [r, g, b] in 0..1. Anything unparsable falls back to black —
 * never white — so a bad value on a wall reads as "off", not as a flash. */
export const hexToRgb01 = (hex) => {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
    if (!match) return [0, 0, 0]
    const n = parseInt(match[1], 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const TOP_OPERATORS = {
    'top.camera': {
        label: 'Camera In',
        family: 'in',
        inputs: [],
        // `source` operators are fed by the engine from a <video>; the shader
        // only flips the camera's top-down rows and applies nothing else.
        source: 'camera',
        // Which camera on its machine. Chosen from the Desk, or in the
        // inspector from the cameras that machine reported; empty is the
        // machine's default camera. The label is kept beside the id because a
        // camera's id differs between two pages of the same machine.
        pickDevice: 'camera',
        params: [toggle('mirror', 'Mirror')],
        fragment: `
uniform sampler2D source;
uniform float p_mirror;
void main() {
    float x = p_mirror > 0.5 ? 1.0 - uv.x : uv.x;
    gl_FragColor = vec4(texture2D(source, vec2(x, 1.0 - uv.y)).rgb, 1.0);
}`
    },

    'top.clip': {
        label: 'Clip In',
        family: 'in',
        inputs: [],
        // A piece of footage from the project's files, played by clipVideos.js
        // and fed to the engine exactly like a camera. The same values are what
        // a VJ deck writes when it triggers a clip.
        source: 'clip',
        // The file: chosen from the project's videos in the inspector; an
        // absolute or relative URL also plays.
        pickAsset: 'video',
        // Kept on the node, not a setting: the deck bumps it to restart the clip.
        state: { trigger: 0 },
        params: [
            param('speed', 'Speed', 1, 0, 4, 0.05),
            choice('mode', 'Play', ['Loop', 'Bounce', 'Once']),
            param('in', 'In', 0, 0, 1),
            param('out', 'Out', 1, 0, 1),
            toggle('playing', 'Playing', 1)
        ],
        fragment: `
uniform sampler2D source;
void main() {
    gl_FragColor = vec4(texture2D(source, vec2(uv.x, 1.0 - uv.y)).rgb, 1.0);
}`
    },

    'top.difference': {
        label: 'Difference',
        family: 'analyse',
        inputs: ['a'],
        // Needs its input from the frame BEFORE: the engine keeps it as `history`.
        history: true,
        params: [
            toggle('compensate', 'Ignore room light', 1),
            toggle('colour', 'Colour')
        ],
        fragment: `
${LUMA}
uniform sampler2D history;
uniform float p_compensate;
uniform float p_colour;
uniform float shift;
void main() {
    vec3 now = texture2D(a, uv).rgb;
    vec3 before = texture2D(history, uv).rgb;
    // Take away what changed EVERYWHERE — a webcam re-exposing, or the
    // projector's own light filling the room it films. Without it, every
    // exposure step lit most of the wall at asuz.
    float s = p_compensate > 0.5 ? shift : 0.0;
    vec3 d = p_colour > 0.5 ? abs(now - before - vec3(s)) : vec3(abs(luma(now) - luma(before) - s));
    gl_FragColor = vec4(d, 1.0);
}`
    },

    'top.level': {
        label: 'Level',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('threshold', 'Ignore below', 0, 0, 1),
            param('gain', 'Gain', 1, 0, 20, 0.1),
            param('brightness', 'Brightness', 0, -1, 1),
            param('gamma', 'Gamma', 1, 0.1, 4),
            toggle('invert', 'Invert'),
            param('opacity', 'Opacity', 1, 0, 1)
        ],
        fragment: `
uniform float p_threshold;
uniform float p_gain;
uniform float p_brightness;
uniform float p_gamma;
uniform float p_invert;
uniform float p_opacity;
void main() {
    vec3 c = texture2D(a, uv).rgb;
    c = max(c - vec3(p_threshold), 0.0) * p_gain + vec3(p_brightness);
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / p_gamma));
    if (p_invert > 0.5) c = 1.0 - c;
    gl_FragColor = vec4(c * p_opacity, 1.0);
}`
    },

    'top.blur': {
        label: 'Blur',
        family: 'adjust',
        inputs: ['a'],
        params: [param('size', 'Size', 2, 0, 12, 0.1)],
        // One pass, 13 taps on a ring and a cross: not a true gaussian, but
        // cheap enough for an old GPU and soft enough for a wall.
        fragment: `
uniform float p_size;
void main() {
    vec2 r = texel * p_size;
    vec3 sum = texture2D(a, uv).rgb * 4.0;
    sum += texture2D(a, uv + vec2( r.x, 0.0)).rgb * 2.0;
    sum += texture2D(a, uv + vec2(-r.x, 0.0)).rgb * 2.0;
    sum += texture2D(a, uv + vec2(0.0,  r.y)).rgb * 2.0;
    sum += texture2D(a, uv + vec2(0.0, -r.y)).rgb * 2.0;
    sum += texture2D(a, uv + vec2( r.x,  r.y) * 1.4).rgb;
    sum += texture2D(a, uv + vec2(-r.x,  r.y) * 1.4).rgb;
    sum += texture2D(a, uv + vec2( r.x, -r.y) * 1.4).rgb;
    sum += texture2D(a, uv + vec2(-r.x, -r.y) * 1.4).rgb;
    sum += texture2D(a, uv + vec2( r.x, 0.0) * 2.5).rgb;
    sum += texture2D(a, uv + vec2(-r.x, 0.0) * 2.5).rgb;
    sum += texture2D(a, uv + vec2(0.0,  r.y) * 2.5).rgb;
    sum += texture2D(a, uv + vec2(0.0, -r.y) * 2.5).rgb;
    gl_FragColor = vec4(sum / 20.0, 1.0);
}`
    },

    'top.edge': {
        label: 'Edge',
        family: 'analyse',
        inputs: ['a'],
        params: [param('strength', 'Strength', 2, 0, 10, 0.1)],
        fragment: `
${LUMA}
uniform float p_strength;
float at(vec2 o) { return luma(texture2D(a, uv + o * texel).rgb); }
void main() {
    float gx = -at(vec2(-1.0, 1.0)) - 2.0 * at(vec2(-1.0, 0.0)) - at(vec2(-1.0, -1.0))
               + at(vec2( 1.0, 1.0)) + 2.0 * at(vec2( 1.0, 0.0)) + at(vec2( 1.0, -1.0));
    float gy = -at(vec2(-1.0, -1.0)) - 2.0 * at(vec2(0.0, -1.0)) - at(vec2(1.0, -1.0))
               + at(vec2(-1.0,  1.0)) + 2.0 * at(vec2(0.0,  1.0)) + at(vec2(1.0,  1.0));
    gl_FragColor = vec4(vec3(clamp(length(vec2(gx, gy)) * p_strength, 0.0, 1.0)), 1.0);
}`
    },

    'top.feedback': {
        label: 'Feedback',
        family: 'time',
        inputs: ['a'],
        params: [
            param('trail', 'Trail', 0.9, 0, 0.99),
            choice('mode', 'Join', ['Keep brightest', 'Add'])
        ],
        // The trail is `self` — this operator's own last frame — faded, then
        // joined with the new input. Kept below 1 so a wall always clears.
        fragment: `
uniform sampler2D self;
uniform float p_trail;
uniform float p_mode;
void main() {
    // The 1/255 step: an 8-bit value times 0.9 rounds back up to itself near
    // black, and the wake would never quite leave.
    vec3 faded = max(texture2D(self, uv).rgb * p_trail - vec3(1.0 / 255.0), 0.0);
    vec3 now = texture2D(a, uv).rgb;
    vec3 c = p_mode > 0.5 ? faded + now : max(faded, now);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`
    },

    // --- the Platina look wave (2026-11-10): the screen effects the artist's
    // reference clips need that Level / Tint / Blur / Edge / Feedback / Reframe
    // cannot make. Recipes: PROGRESS.md (the feat-deck-ref-effects entry).
    // The picture pipeline carries no alpha (8-bit RGB, opaque canvas), so
    // "transparent" is black: put a layer with a black background on a layer
    // below with blend Add or Screen and the lower layer shows through.

    'top.freeze': {
        label: 'Freeze',
        family: 'time',
        inputs: ['a'],
        params: [toggle('hold', 'Hold', 1)],
        // Stateful like Feedback: `self` is this operator's own last frame. A
        // freshly made target is cleared to alpha 0, and every frame this
        // operator draws is alpha 1 — so alpha 0 in `self` means "nothing held
        // yet": the first frame passes the live picture through and from then
        // on `self` holds it. Effects that are off have no node (vjDeck.js
        // runStack), so switching Freeze ON starts a fresh target and freezes
        // the frame on screen at that moment; switching it off drops it.
        fragment: `
uniform sampler2D self;
uniform float p_hold;
void main() {
    vec4 held = texture2D(self, uv);
    vec3 live = texture2D(a, uv).rgb;
    gl_FragColor = vec4((p_hold > 0.5 && held.a > 0.5) ? held.rgb : live, 1.0);
}`
    },

    'top.silhouette': {
        label: 'Silhouette',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` only when Drift or Flash is above 0.
        animated: true,
        params: [
            param('threshold', 'Threshold', 0.5, 0, 1),
            param('soft', 'Softness', 0.05, 0, 0.5),
            toggle('invert', 'Invert'),
            colour('colour', 'Subject', '#ffffff'),
            colour('back', 'Background', '#000000'),
            // Both 0 = exactly the old look. Drift turns the Background's hue round
            // the colour circle (1 = one turn every 2 s); Flash swaps Subject and
            // Background in a hard on/off, Flash x 12 swaps a second (the engine
            // gives shaders `time` only, no BPM or beat phase). A black
            // Background has no hue: Drift needs a colour there to show.
            param('drift', 'Drift', 0, 0, 1),
            param('flash', 'Flash', 0, 0, 1)
        ],
        // Luma against a threshold with a smooth edge: the bright part of the
        // picture becomes the Subject colour, the rest the Background colour
        // (Invert swaps which is which, for a dark figure on a light wall).
        // Background black + the layer's blend Add/Screen lets what is below show.
        fragment: `
${LUMA}
uniform float p_threshold;
uniform float p_soft;
uniform float p_invert;
uniform vec3 p_colour;
uniform vec3 p_back;
uniform float p_drift;
uniform float p_flash;
void main() {
    float l = luma(texture2D(a, uv).rgb);
    float s = max(p_soft, 0.0005);
    float m = smoothstep(p_threshold - s, p_threshold + s, l);
    if (p_invert > 0.5) m = 1.0 - m;
    vec3 back = p_back;
    if (p_drift > 0.0) {
        // Hue turn = rotation about the grey axis (1,1,1).
        float ang = 3.14159265 * p_drift * mod(time, 3600.0);
        vec3 k = vec3(0.57735027);
        back = back * cos(ang) + cross(k, back) * sin(ang) + k * dot(k, back) * (1.0 - cos(ang));
        back = clamp(back, 0.0, 1.0);
    }
    if (p_flash > 0.0 && mod(floor(time * p_flash * 12.0), 2.0) > 0.5) m = 1.0 - m;
    gl_FragColor = vec4(mix(back, p_colour, m), 1.0);
}`
    },

    'top.lineart': {
        label: 'Line art',
        family: 'analyse',
        inputs: ['a'],
        params: [
            param('bands', 'Contours', 8, 1, 40, 1),
            param('width', 'Line width', 1.5, 0.5, 6, 0.1),
            param('edges', 'Outline', 0.5, 0, 1),
            colour('colour', 'Line', '#4da6ff'),
            colour('back', 'Background', '#000000')
        ],
        // Thin lines in one colour: the iso-lines of brightness (where luma
        // crosses k / Contours — the nested contour stripes of a lit body)
        // plus a Sobel outline. Line width is measured in pixels: the distance
        // to the nearest iso-level divided by the local brightness gradient.
        fragment: `
${LUMA}
uniform float p_bands;
uniform float p_width;
uniform float p_edges;
uniform vec3 p_colour;
uniform vec3 p_back;
float at(vec2 o) { return luma(texture2D(a, uv + o * texel).rgb); }
void main() {
    float gx = -at(vec2(-1.0, 1.0)) - 2.0 * at(vec2(-1.0, 0.0)) - at(vec2(-1.0, -1.0))
               + at(vec2( 1.0, 1.0)) + 2.0 * at(vec2( 1.0, 0.0)) + at(vec2( 1.0, -1.0));
    float gy = -at(vec2(-1.0, -1.0)) - 2.0 * at(vec2(0.0, -1.0)) - at(vec2(1.0, -1.0))
               + at(vec2(-1.0,  1.0)) + 2.0 * at(vec2(0.0,  1.0)) + at(vec2(1.0,  1.0));
    float grad = length(vec2(gx, gy)) * 0.25;
    float v = at(vec2(0.0)) * p_bands;
    float d = abs(fract(v + 0.5) - 0.5);
    float px = d / max(grad * p_bands, 0.02);
    float iso = 1.0 - smoothstep(p_width - 0.5, p_width + 0.5, px);
    float edge = clamp(grad * 6.0, 0.0, 1.0) * p_edges;
    gl_FragColor = vec4(mix(p_back, p_colour, clamp(max(iso, edge), 0.0, 1.0)), 1.0);
}`
    },

    // Body: the person cut out as a flat shape (bodyMatte.js finds them). `a` is the
    // picture on the stack, `b` the layer's source picture BEFORE its other
    // effects: the model looks at `b`, the colours are painted over `a`. The
    // engine gives it `mask` (the model's answer, top-down, 8-bit) and
    // matte_ready (0 while the model loads or when it is not available: the
    // shader then passes `a` through unchanged). The echo trail lives in this
    // operator's own alpha (`self`): every operator draws alpha 1 except this one.
    'top.matte': {
        label: 'Body',
        family: 'adjust',
        inputs: ['a', 'b'],
        matte: true,
        animated: true,
        params: [
            param('soft', 'Softness', 0.3, 0, 1),
            param('drift', 'Drift', 0, 0, 1),
            param('echo', 'Echo', 0, 0, 1),
            colour('colour', 'Body', '#000000'),
            colour('back', 'Background', '#e8456b'),
            param('shade', 'Shade', 0, 0, 1),
            param('fill', 'Fill', 1, 0, 1),
            toggle('invert', 'Invert'),
            // 0 = flat background colour; 1 = the picture stays around the person, dimmed (the person stands out of the room)
            param('keep', 'Keep room', 0, 0, 1),
            // 0 = the model's own mask (small, soft, a little late); 1 = the mask drawn again along the
            // edges of the live picture, at the picture's own sharpness (docs/architecture/BODY_TRACKING.md)
            param('refine', 'Fine edge', 0, 0, 1)
        ],
        fragment: `
uniform sampler2D self;
uniform sampler2D mask;
uniform float matte_ready;
uniform float p_soft;
uniform float p_drift;
uniform float p_echo;
uniform float p_shade;
uniform float p_fill;
uniform float p_invert;
uniform float p_keep;
uniform float p_refine;
uniform vec3 p_colour;
uniform vec3 p_back;
vec3 hueTurn(vec3 c, float turns) {
    float k = 6.2831853 * turns;
    const vec3 w = vec3(0.57735);
    return c * cos(k) + cross(w, c) * sin(k) + w * dot(w, c) * (1.0 - cos(k));
}
float person(vec2 o) {
    vec2 q = uv + o * texel;
    return texture2D(mask, vec2(q.x, 1.0 - q.y)).r;
}
float edge(float v) {
    float w = 0.04 + p_soft * 0.42;
    return smoothstep(0.5 - w, 0.5 + w, v);
}
// Fine edge: the model answers on a small grid (256 wide inside), so its outline is blocky and a frame or
// two behind. The live picture (b) is sharp and current. Around this pixel, the mask is averaged only over
// the neighbours that LOOK like this pixel (same colour = same side of the outline), so the outline moves
// onto the real edge of the body in the picture. Where the picture has no edge it is a plain smoothing.
float fine() {
    vec3 here = texture2D(b, uv).rgb;
    float sum = person(vec2(0.0)) * 0.5;
    float wsum = 0.5;
    float reach = 3.0 + p_refine * 13.0;
    for (int i = 0; i < 20; i++) {
        float fi = float(i);
        float rad = sqrt((fi + 0.5) / 20.0) * reach;
        float ang = fi * 2.399963;
        vec2 o = vec2(cos(ang), sin(ang)) * rad;
        vec3 dc = texture2D(b, uv + o * texel).rgb - here;
        float w = exp(-dot(dc, dc) / 0.01);
        sum += person(o) * w;
        wsum += w;
    }
    return sum / wsum;
}
float decay() { return p_echo * 0.985; }
float trailAt(vec2 o) {
    vec2 q = clamp(uv + o * texel, vec2(0.0), vec2(1.0));
    return max(edge(person(o)), max(texture2D(self, q).a * decay() - 1.0 / 255.0, 0.0));
}
void main() {
    vec3 pic = texture2D(a, uv).rgb;
    if (matte_ready < 0.5) { gl_FragColor = vec4(pic, 0.0); return; }
    float m = edge(p_refine > 0.01 ? fine() : person(vec2(0.0)));
    vec3 back = clamp(hueTurn(p_back, time * p_drift * 0.125), 0.0, 1.0);
    back = mix(back, pic * 0.42, p_keep);
    vec3 body = mix(p_colour, back * 0.55, p_shade);
    float seen = p_invert > 0.5 ? 1.0 - m : m;
    vec3 inside = mix(pic, body, p_fill);
    vec3 outside = back;
    if (p_invert > 0.5) { outside = mix(pic, body, p_fill); inside = back; }
    vec3 col = mix(outside, inside, seen);
    float t = 0.0;
    if (p_echo > 0.001) {
        t = trailAt(vec2(0.0));
        float gx = trailAt(vec2(1.0, 0.0)) - trailAt(vec2(-1.0, 0.0));
        float gy = trailAt(vec2(0.0, 1.0)) - trailAt(vec2(0.0, -1.0));
        float grad = length(vec2(gx, gy)) * 0.5;
        float bands = 6.0;
        float d = abs(fract(t * bands + 0.5) - 0.5);
        float px = d / max(grad * bands, 0.02);
        float line = (1.0 - smoothstep(0.5, 1.5, px)) * smoothstep(0.02, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t));
        col = mix(col, body, line * (1.0 - m));
    }
    gl_FragColor = vec4(col, t);
}`
    },

    'top.depthscan': {
        label: 'Depth scan',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` (the scanner bar travels, the grain moves).
        animated: true,
        params: [
            param('depth', 'Depth', 0.6, 0, 1),
            param('bands', 'Bands', 0, 0, 12, 1),
            param('scan', 'Scanner', 0.6, 0, 1),
            param('rim', 'X-ray edge', 0.6, 0, 1),
            param('haze', 'Haze', 0.35, 0, 1),
            param('relief', 'Relief', 0.3, 0, 1),
            param('speed', 'Scan speed', 0.5, 0, 4, 0.05),
            param('grain', 'Grain', 0.15, 0, 1),
            toggle('invert', 'Film (negative)', 0),
            param('cut', 'Two-tone', 0, 0, 1),
            param('flash', 'Flash (Hz)', 0, 0, 15, 0.5),
            // 0 white-hot (grey), 1 iron (the thermal camera), 2 rainbow, 3 olive (night shot), 4 chrome (polished metal),
            // 5 night green (a stage seen through night vision), 6 ghost (cold white light on black)
            param('tone', 'Thermal colour', 0, 0, 6, 1),
            param('hud', 'Camera frame', 0, 0, 1),
            // a thermal sensor is small (160 x 120): the heat read on a coarse grid and blown up soft
            param('sensor', 'Sensor blur', 0, 0, 1),
            // thin dark lines over the picture, 10 tall panes across and 4 up: a wall of windows
            param('grid', 'Window grid', 0, 0, 1)
        ],
        // A camera has no depth, so this reads one out of the light: black and white, the picture of a depth
        // scanner or an x-ray plate (the references: a depth pass of two dancers, a clay relief, stepped depth
        // contours). Brightness is smoothed over a wide disc with an edge-keeping weight, so skin and cloth go
        // smooth like clay and outlines stay sharp; the slope of that field lights the edges of every volume (the
        // x-ray rim) and shades it like a relief; Bands reads it in steps; Haze is the milk in the air; the
        // Scanner bar travels down the picture, trembles what is under it and leaves a glow behind.
        // One pass, 21 taps. Deterministic: every random-looking value is a hash of the pixel and the time.
        fragment: `
uniform float p_depth;
uniform float p_bands;
uniform float p_rim;
uniform float p_relief;
uniform float p_haze;
uniform float p_scan;
uniform float p_speed;
uniform float p_grain;
uniform float p_invert;
uniform float p_cut;
uniform float p_flash;
uniform float p_tone;
uniform float p_hud;
uniform float p_sensor;
uniform float p_grid;
// The palettes of a thermal camera: heat 0..1 -> colour. Iron: black, deep blue, purple, red, orange, yellow, white.
vec3 ds_ramp(float v, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5) {
    float s = clamp(v, 0.0, 1.0) * 5.0;
    vec3 c = mix(c0, c1, clamp(s, 0.0, 1.0));
    c = mix(c, c2, clamp(s - 1.0, 0.0, 1.0));
    c = mix(c, c3, clamp(s - 2.0, 0.0, 1.0));
    c = mix(c, c4, clamp(s - 3.0, 0.0, 1.0));
    return mix(c, c5, clamp(s - 4.0, 0.0, 1.0));
}
vec3 ds_tone(float v, float tone) {
    if (tone < 0.5) return vec3(v);
    if (tone < 1.5) return ds_ramp(v, vec3(0.0), vec3(0.10, 0.0, 0.42), vec3(0.58, 0.04, 0.56), vec3(0.93, 0.24, 0.13), vec3(1.0, 0.72, 0.05), vec3(1.0, 1.0, 0.94));
    if (tone < 2.5) return ds_ramp(v, vec3(0.03, 0.05, 0.50), vec3(0.0, 0.42, 0.98), vec3(0.15, 0.88, 0.30), vec3(0.99, 0.92, 0.08), vec3(1.0, 0.16, 0.28), vec3(1.0, 0.86, 0.86));
    // chrome: light and dark bands turning over each other like a reflection on polished metal, a cold tint
    // ghost: a body of cold light. Black, deep blue, pale blue-white, a white core with a breath of green.
    if (tone > 5.5) return ds_ramp(v, vec3(0.0), vec3(0.03, 0.07, 0.11), vec3(0.20, 0.40, 0.50), vec3(0.58, 0.84, 0.88), vec3(0.86, 1.0, 0.94), vec3(0.96, 1.0, 0.92));
    // night green: fog lit green, the bright end a vivid lime
    if (tone > 4.5) return ds_ramp(v, vec3(0.0, 0.015, 0.005), vec3(0.0, 0.09, 0.03), vec3(0.02, 0.26, 0.07), vec3(0.08, 0.52, 0.15), vec3(0.28, 0.84, 0.30), vec3(0.78, 1.0, 0.72));
    if (tone > 3.5) {
        float m = 0.5 + 0.5 * sin(v * 9.4 - 1.2);
        float g = clamp(mix(v, m, 0.62) * 1.15 - 0.05, 0.0, 1.0);
        return mix(vec3(0.02, 0.03, 0.05), vec3(0.93, 0.96, 1.0), g * g * (3.0 - 2.0 * g));
    }
    // olive: the army-green grade of a night shot, light end almost white
    return mix(vec3(v * 0.58, v * 0.70, v * 0.24), vec3(v), smoothstep(0.75, 1.0, v) * 0.7);
}
// The frame a thermal camera draws over its picture: corner marks, a centre cross, the palette as a scale.
float ds_hud(vec2 p, vec2 px) {
    vec2 q = abs(p - 0.5);
    float cross = step(q.x, px.x * 1.5) * step(0.012, q.y) * step(q.y, 0.04) + step(q.y, px.y * 1.5) * step(0.007, q.x) * step(q.x, 0.0225);
    vec2 m = vec2(0.46, 0.44) - q;
    float corner = step(0.0, min(m.x, m.y)) * step(min(m.x, m.y * 0.5625), 0.0018) * step(max(m.x, m.y * 0.5625), 0.03);
    return clamp(cross + corner, 0.0, 1.0);
}
float ds_luma(vec2 p) { return dot(texture2D(a, p).rgb, vec3(0.299, 0.587, 0.114)); }
float ds_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float ds_cell(vec2 c, vec2 cell) {
    vec2 o = cell * 0.25;
    return 0.5 * (ds_luma(c + o) + ds_luma(c - o));
}
vec4 ds_spline(float f) {
    float f2 = f * f;
    float f3 = f2 * f;
    return vec4(1.0 - 3.0 * f + 3.0 * f2 - f3, 3.0 * f3 - 6.0 * f2 + 4.0, -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0, f3) / 6.0;
}
void main() {
    // the scanner bar: where it is on its way down, and the tremble of the picture under it
    float sweep = fract(time * p_speed * 0.25);
    float dy = uv.y - (1.0 - sweep);
    dy -= floor(dy + 0.5);
    float bar = exp(-dy * dy / 0.0012);
    vec2 px = mod(floor(uv / texel), 256.0);
    float jit = ds_hash(vec2(mod(floor(uv.y / (texel.y * 2.0)), 512.0), mod(floor(time * 30.0), 211.0))) - 0.5;
    vec2 p = uv + vec2(jit * 0.012 * bar * p_scan, 0.0);

    // The depth field. Brightness read over a wide disc (20 taps on a golden spiral, turned by a
    // per-pixel angle so the gaps between taps come out as fine grain, not as ghost outlines).
    // A tap counts for more the closer its brightness is to this pixel's own, so the inside of a
    // body goes smooth like clay while its outline stays sharp: texture goes, volume stays.
    // The same taps, unweighted, give the slope of the field for free.
    vec2 R = texel * (3.0 + p_depth * 26.0);
    float turn = ds_hash(px + vec2(mod(floor(time * 24.0), 97.0) * step(0.001, p_grain), 5.0)) * 6.2832;
    float c = ds_luma(p);
    float sum = c;
    float wsum = 1.0;
    float plain = 0.0;
    vec2 mom = vec2(0.0);
    vec2 osum = vec2(0.0);
    float rr = 0.0;
    for (int i = 0; i < 20; i++) {
        float fi = float(i);
        float rad = sqrt((fi + 0.5) / 20.0);
        float ang = fi * 2.399963 + turn;
        vec2 o = vec2(cos(ang), sin(ang)) * rad;
        float l = ds_luma(p + o * R);
        float dl = l - c;
        float wt = exp(-dl * dl / 0.02);
        sum += l * wt;
        wsum += wt;
        plain += l;
        mom += l * o;
        osum += o;
        rr += rad * rad;
    }
    float field = plain / 20.0;
    vec2 g = (mom - field * osum) / rr;
    float d = mix(c, sum / wsum, 0.6 + 0.4 * p_depth);
    // near = light, far = dark: the lows fall away, the lit body stands out
    d = pow(smoothstep(0.10, 0.80, d), 1.25);
    if (p_sensor > 0.02) {
        // the small sensor: brightness averaged in cells, the cells joined by a soft curve
        vec2 cell = texel * (8.0 + p_sensor * 72.0);
        vec2 at = p / cell - 0.5;
        vec2 base = floor(at);
        vec4 wx = ds_spline(fract(at.x));
        vec4 wy = ds_spline(fract(at.y));
        float low = 0.0;
        for (int j = 0; j < 4; j++) {
            float wj = j == 0 ? wy.x : j == 1 ? wy.y : j == 2 ? wy.z : wy.w;
            for (int i = 0; i < 4; i++) {
                float wi = i == 0 ? wx.x : i == 1 ? wx.y : i == 2 ? wx.z : wx.w;
                low += wi * wj * ds_cell((base + vec2(float(i) - 0.5, float(j) - 0.5)) * cell, cell);
            }
        }
        d = pow(smoothstep(0.04, 0.85, low), 1.1);
    }

    // how the surface turns. Steep = the edge of a volume.
    float rim = smoothstep(0.05, 0.45, length(g) * 2.0);
    float shade = clamp(dot(g, vec2(-0.6, 0.8)) * 1.6, -0.35, 0.35);

    float v = d + p_relief * shade * (0.3 + 0.7 * d);
    // depth read in steps, like a scanner's contour bands
    float nb = floor(p_bands + 0.5);
    if (nb >= 2.0) v = mix(v, floor(v * nb + 0.5) / nb, 0.9);
    // x-ray: the insides go a little thin, the edges of every volume light up
    v = v * (1.0 - 0.25 * p_rim) + rim * p_rim * 0.55 * (0.25 + 0.75 * d);
    // the milk in the air
    v += p_haze * 0.45 * field * (1.0 - v);
    // two-tone: the picture cut into pure black and pure white, a silhouette
    v = mix(v, smoothstep(0.36, 0.44, v), p_cut);
    // the bar itself: a soft band, a hard line, and the glow it leaves on what it has just read
    float line = exp(-dy * dy / 0.000012);
    float trail = exp(-fract(uv.y - (1.0 - sweep)) * 7.0);
    v += p_scan * (bar * (0.12 + 0.4 * rim + 0.2 * d) + line * 0.45 + trail * 0.08 * (0.4 + d));
    // film grain
    v += (ds_hash(px + vec2(mod(floor(time * 24.0), 97.0), 3.0)) - 0.5) * 0.08 * p_grain;
    v = clamp(v, 0.0, 1.0);
    // flash: negative and positive change places p_flash times a second
    float flip = p_flash > 0.05 ? step(0.5, fract(time * p_flash)) : 0.0;
    v = mix(v, 1.0 - v, abs(p_invert - flip));
    float tone = floor(p_tone + 0.5);
    vec3 col = ds_tone(v, tone);
    if (p_hud > 0.01) {
        // the scale at the right edge: the palette from cold (bottom) to hot (top), in a thin white frame
        vec2 b = (uv - vec2(0.962, 0.5)) / vec2(0.006, 0.2);
        float inBar = step(abs(b.x), 1.0) * step(abs(b.y), 1.0);
        float frame = step(abs(b.x), 1.0 + texel.x / 0.006 * 1.5) * step(abs(b.y), 1.0 + texel.y / 0.2 * 1.5) - inBar;
        col = mix(col, ds_tone(b.y * 0.5 + 0.5, tone), inBar * p_hud);
        col = mix(col, vec3(1.0), clamp(frame + ds_hud(uv, texel), 0.0, 1.0) * p_hud);
    }
    if (p_grid > 0.01) {
        vec2 pane = abs(fract(uv * vec2(10.0, 4.0)) - 0.5);
        float bar = max(step(0.5 - texel.x * 12.0, pane.x), step(0.5 - texel.y * 4.8, pane.y));
        col = mix(col, col * 0.22, bar * p_grid);
    }
    gl_FragColor = vec4(col, 1.0);
}`
    },

    'top.cuts': {
        label: 'Cuts',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` (the cuts come in time).
        animated: true,
        params: [
            param('rate', 'Cuts per second', 2, 0.25, 8, 0.25),
            param('zoom', 'Punch-in', 0.5, 0, 1),
            param('move', 'Reframe', 0.6, 0, 1),
            param('mirror', 'Flip', 0.3, 0, 1),
            param('flash', 'Flash frame', 0.6, 0, 1),
            param('bars', 'Bars', 0, 0, 1),
            param('burst', 'Burst', 0, 0, 1),
            param('lens', 'Fisheye', 0, 0, 1),
            // MULTISCREEN: the frame as a wall of 2 x 2, 3 x 3 or 4 x 4 screens, each with its own framing and cuts
            param('tiles', 'Screens', 1, 1, 4, 1),
            // PRESS values: 1 while a key is held (the deck's fxPress action), 0 otherwise. A scene never sets them.
            param('hit', 'Press: burst', 0, 0, 1, 1),
            param('punch', 'Press: punch-in', 0, 0, 1, 1),
            param('flip', 'Press: flip', 0, 0, 1, 1),
            param('neg', 'Press: negative', 0, 0, 1, 1),
            param('strobe', 'Press: strobe', 0, 0, 1, 1),
            param('black', 'Press: black', 0, 0, 1, 1),
            param('multi', 'Press: screens', 0, 0, 1, 1)
        ],
        // The picture edited like a music video, live. Time is cut into SHOTS (Cuts per second); every shot is one
        // still framing, chosen once at its cut: a size (wide, medium or close: Punch-in), a place in the frame
        // (Reframe), sometimes mirrored (Flip). Nothing moves inside a shot but a slow push-in, so it reads as an
        // edit and not as a wobble. Flash frame: about half the cuts open on one negative frame, the way a cut is
        // hit in an edit. Bars: black bands above and below, the film frame.
        // Burst: how many of the shots are a BURST, the way a music video hits a bar: two framings intercut every
        // tenth of a second, the second one negative, for the length of the shot; then a held shot again.
        // Deterministic: every choice is a hash of the shot number.
        fragment: `
uniform float p_rate;
uniform float p_zoom;
uniform float p_move;
uniform float p_mirror;
uniform float p_flash;
uniform float p_bars;
uniform float p_burst;
uniform float p_lens;
uniform float p_hit;
uniform float p_punch;
uniform float p_flip;
uniform float p_neg;
uniform float p_strobe;
uniform float p_black;
uniform float p_tiles;
uniform float p_multi;
float ct_hash(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453123); }
void main() {
    float rate = max(p_rate, 0.05);
    float t = time * rate;
    float shot = mod(floor(t), 4096.0);
    float into = fract(t) / rate;
    // multiscreen: every screen of the wall is its own little frame with its own shots
    float wall = max(floor(p_tiles + 0.5), 1.0 + 2.0 * step(0.5, p_multi));
    vec2 q = uv;
    float seam = 1.0;
    if (wall > 1.5) {
        vec2 tile = floor(uv * wall);
        q = fract(uv * wall);
        shot += tile.x * 31.0 + tile.y * 57.0;
        vec2 e = min(q, 1.0 - q) * vec2(1.7778, 1.0);
        seam = step(0.012, min(e.x, e.y));
    }
    // a burst shot: every other tenth of a second is the B framing, in negative
    // a held burst key is a burst too, whatever the scene: medium shot and close shot intercut
    float held = step(0.5, p_hit);
    float isBurst = max(step(ct_hash(shot + 101.0), p_burst), held);
    float side = isBurst * mod(floor(time * 10.0), 2.0);
    shot += side * 977.0;
    float zoom = max(p_zoom, 0.7 * held);
    float move = max(p_move, 0.6 * held);
    float size = mix(floor(ct_hash(shot) * 3.0), 1.0 + side, held);
    float z = (1.0 + zoom * size * 0.45) * (1.0 + 0.04 * zoom * min(into, 4.0)) * (1.0 + 0.8 * step(0.5, p_punch));
    vec2 room = vec2(0.5 - 0.5 / z);
    vec2 c = vec2(0.5) + (vec2(ct_hash(shot + 17.0), ct_hash(shot + 43.0)) * 2.0 - 1.0) * room * move;
    vec2 p = (q - 0.5) / z + c;
    if (ct_hash(shot + 71.0) < p_mirror * 0.5) p.x = 1.0 - p.x;
    if (p_flip > 0.5) p.x = 1.0 - p.x;
    // fisheye: the middle of the frame pushed at the viewer, the corners falling away into black
    vec2 fc = (p - 0.5) * vec2(1.7778, 1.0);
    float fr = dot(fc, fc) * 2.2;
    p = 0.5 + (p - 0.5) * mix(1.0, 0.5 + 0.75 * fr, p_lens);
    vec3 col = texture2D(a, clamp(p, 0.0, 1.0)).rgb;
    col *= 1.0 - p_lens * smoothstep(0.62, 1.05, fr);
    float hit = step(into, 0.05) * step(0.5, ct_hash(shot + 5.0)) * p_flash * (1.0 - isBurst);
    // negative: a flash frame, the B side of a burst, the held negative key, the held strobe (10 times a second)
    float inv = max(hit, side);
    inv = abs(inv - step(0.5, p_neg));
    inv = abs(inv - step(0.5, p_strobe) * mod(floor(time * 20.0), 2.0));
    col = mix(col, 1.0 - col, inv);
    col *= step(abs(uv.y - 0.5), 0.5 - 0.13 * p_bars);
    col *= seam * (1.0 - step(0.5, p_black));
    gl_FragColor = vec4(col, 1.0);
}`
    },

    'top.angles': {
        label: 'Angles',
        family: 'adjust',
        // b = the second camera: the deck wires it (vjDeck.js runStack), anywhere else b is what you give it
        inputs: ['a', 'b'],
        second: true,
        // Reads `time` (the screens change angle in time).
        animated: true,
        params: [
            // 1 = off (the picture as it is), 2 = two halves, 3 = three tall screens, 4 = two by two
            param('screens', 'Screens', 1, 1, 4, 1),
            param('hold', 'Seconds per angle', 4, 0.5, 16, 0.5),
            param('zoom', 'Close-ups', 0.6, 0, 1),
            param('gap', 'Line between', 1, 0, 1),
            // PRESS value: 1 while a key is held (the deck's fxPress action). A scene never sets it.
            param('multi', 'Press: screens', 0, 0, 1, 1)
        ],
        // The frame as a wall of screens, each one a different ANGLE on the stage: screens side by side show
        // different cameras (a and b), each at its own shot size (wide, medium, close) and its own place in the
        // picture. A screen holds its angle for Seconds per angle with a slow push-in, then cuts to the other
        // camera at another size; the screens change one after another, never together. A tall screen takes the
        // slice of the camera that fits it, nothing is squeezed. Deterministic: a hash of the shot number.
        fragment: `
uniform float p_screens;
uniform float p_hold;
uniform float p_zoom;
uniform float p_gap;
uniform float p_multi;
float an_hash(float n) { return fract(sin(n * 91.7 + 1.3) * 43758.5453123); }
void main() {
    // a held key is three tall screens, whatever the scene
    float n = max(floor(p_screens + 0.5), 1.0 + 2.0 * step(0.5, p_multi));
    if (n < 1.5) { gl_FragColor = vec4(texture2D(a, uv).rgb, 1.0); return; }
    // the wall: 2 = two halves, 3 = three tall screens, 4 = two by two
    vec2 cells = n > 3.5 ? vec2(2.0, 2.0) : vec2(n, 1.0);
    vec2 tile = min(floor(uv * cells), cells - 1.0);
    vec2 q = uv * cells - tile;
    float id = tile.x + tile.y * cells.x;
    // every screen holds one angle; the screens change one after another, never all at once
    float t = time / max(p_hold, 0.1) + id / (cells.x * cells.y);
    float shot = mod(floor(t), 4096.0);
    float into = fract(t) * max(p_hold, 0.1);
    // which camera: screens side by side never show the same one, and a screen swaps cameras at its change
    float cam = mod(id + tile.y + shot, 2.0);
    // the size of the shot: wide, medium, close; never the size this screen had before, never the neighbour's
    float size = mod(id + shot + floor(an_hash(floor(shot / 3.0) + 7.0) * 3.0), 3.0);
    float z = (1.0 + p_zoom * size * 0.6) * (1.0 + 0.012 * min(into, 12.0));
    // the piece of the camera picture that fits this screen without squeezing it
    vec2 piece = vec2(cells.y / cells.x, 1.0) / z;
    vec2 room = (1.0 - piece) * 0.5;
    vec2 c = vec2(0.5) + (vec2(an_hash(shot * 3.0 + id * 17.0), an_hash(shot * 5.0 + id * 29.0)) * 2.0 - 1.0) * room * vec2(0.45, 0.35);
    // a close shot looks at the head, not at the belt
    c.y += room.y * 0.4 * step(0.5, size);
    vec2 p = clamp(c + (q - 0.5) * piece, 0.0, 1.0);
    vec3 col = mix(texture2D(a, p).rgb, texture2D(b, p).rgb, cam);
    // a thin dark line between the screens
    vec2 e = min(q, 1.0 - q) * vec2(1.7778 / cells.x, 1.0 / cells.y);
    vec2 inner = vec2(step(1.5, cells.x), step(1.5, cells.y));
    float edge = min(mix(1.0, e.x, inner.x), mix(1.0, e.y, inner.y));
    col *= step(0.006 * p_gap, edge);
    gl_FragColor = vec4(col, 1.0);
}`
    },

    'top.hologram': {
        label: 'Hologram',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` (the beam climbs, the cloud turns).
        animated: true,
        params: [
            // 0 = the picture as it is (the effect costs nothing), 1 = the scan alone
            param('amount', 'Amount', 0, 0, 1),
            param('rows', 'Row spacing', 6, 3, 24, 1),
            param('relief', 'Relief', 3, 0, 6, 0.25),
            // 0 = unbroken scan lines, 1 = separate points
            param('points', 'Points', 0.8, 0, 1),
            param('turn', 'Turn', 0.4, 0, 1),
            param('beam', 'Beam', 0.6, 0, 1),
            param('speed', 'Speed', 1, 0, 3, 0.05),
            param('floor', 'Dark limit', 0.08, 0, 0.9),
            // 1 = dark points on a white wall
            param('white', 'On white', 0, 0, 1, 1)
        ],
        // The picture as a 3D SCAN: rows of fine points of light, each row lifted by the depth of the picture
        // under it (bright = near), so a face or a body stands out of the screen like a point cloud. Dark = no
        // points: a body on black (the Body effect before it) is a hologram of the body alone. Turn: the cloud
        // is seen a little from one side, then the other. Beam: a line of light climbs the picture and what it
        // has just passed glows. No memory of the last frame: every point is worked out from the time alone.
        // For each pixel: the rows below it that their depth could lift this far (8 at most), two reads a row.
        fragment: `
uniform float p_amount;
uniform float p_white;
uniform float p_rows;
uniform float p_relief;
uniform float p_points;
uniform float p_turn;
uniform float p_beam;
uniform float p_speed;
uniform float p_floor;
float hg_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float hg_lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
    vec3 live = texture2D(a, uv).rgb;
    if (p_amount < 0.004) { gl_FragColor = vec4(live, 1.0); return; }
    vec2 px = uv / texel;
    float rows = max(p_rows, 2.0);
    float pitch = rows * 0.55;
    float r0 = floor(px.y / rows);
    float sway = sin(time * 0.6 * p_speed) * p_turn * rows * 2.2;
    // the beam climbs the picture; what it has just passed still glows
    float by = fract(time * 0.18 * p_speed);
    vec3 col = vec3(0.0);
    float cover = 0.0;
    for (int k = 0; k <= 7; k++) {
        float fk = float(k);
        if (fk > p_relief + 1.0) break;
        float r = r0 - fk;
        float rowY = (r + 0.5) * rows;
        if (rowY < 0.0) break;
        // depth here (the light of the picture), then the same point seen a little from the side
        vec2 at = vec2(px.x, rowY) * texel;
        float l0 = hg_lum(texture2D(a, at).rgb);
        at.x = clamp(at.x - (l0 - 0.5) * sway * texel.x, 0.0, 1.0);
        vec3 src = texture2D(a, at).rgb;
        float l = hg_lum(src);
        float lit = smoothstep(p_floor, p_floor + 0.06, l);
        if (lit < 0.01) continue;
        // the row is lifted by the depth: near parts rise over far ones
        float dy = px.y - (rowY + p_relief * rows * l);
        if (abs(dy) > 3.0) continue;
        float line = 1.0 - smoothstep(0.35, 1.25, abs(dy));
        // the row as separate points: a little uneven, a few missing, a few twinkling
        float cell = floor(px.x / pitch);
        vec2 key = vec2(cell, r);
        float cx = (cell + 0.5 + (hg_hash(key) - 0.5) * 0.7) * pitch;
        float rad = 0.9 + 1.0 * l;
        float dot1 = 1.0 - smoothstep(rad - 0.55, rad + 0.55, length(vec2(px.x - cx, dy)));
        float there = step(0.12, hg_hash(key + 3.7));
        float tw = hg_hash(key + 9.1);
        float twinkle = 1.0 - 0.6 * step(0.9, tw) * step(0.5, fract(time * 5.0 * p_speed + tw * 13.0));
        float m = mix(line * 0.8, dot1 * there * twinkle, p_points) * lit;
        float ry = rowY * texel.y;
        float behind = by - ry + step(by, ry);
        float glowed = 0.5 + p_beam * (1.6 * exp(-abs(ry - by) * 55.0) + 0.5 * exp(-behind * 5.0)) + 0.5 * (1.0 - p_beam);
        m *= (0.45 + 0.75 * l) * glowed;
        if (m > cover) { cover = m; col = src / max(max(src.r, max(src.g, src.b)), 0.001); }
    }
    vec3 outc = col * min(cover, 1.4);
    // on a white wall: the same points, dark
    outc = mix(outc, vec3(1.0) - vec3(min(cover, 1.0)), step(0.5, p_white));
    gl_FragColor = vec4(mix(live, outc, p_amount), 1.0);
}`
    },

    'top.particles': {
        label: 'Particles',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` (the dots fly).
        animated: true,
        params: [
            param('size', 'Grain size', 12, 3, 40, 1),
            param('fly', 'Flying', 0.6, 0, 1),
            param('reach', 'Reach', 10, 1, 14, 1),
            param('speed', 'Speed', 0.6, 0.05, 3, 0.05),
            param('angle', 'Wind', 20, -180, 180, 1),
            param('dot', 'Dot', 0.42, 0.15, 0.6),
            param('floor', 'Dark limit', 0.12, 0, 0.9),
            param('keep', 'Picture under', 0, 0, 1),
            // lines drawn from grain to grain where both are lit: the body as a wire mesh
            param('lines', 'Lines', 0, 0, 1),
            // 1 = round grains on a square grid. More = fine dust: the grid is stretched along the wind, the grains
            // fly that much farther and draw out into short streaks as they go, like dust caught in a long exposure
            param('streak', 'Streak', 1, 1, 6, 0.5)
        ],
        // The picture as grains of dust. Every grain has a home on a grid laid along the wind and takes the
        // colour and the size of the picture there (dark = no grain, so a white body on black is a body of
        // grains). Flying: the share of grains that leave home, slowly at first, then with the wind, getting
        // smaller, and are born again at home. No memory of the last frame: a grain's place is worked out
        // from the time alone, so nothing smears and a still picture gives the same dust every time.
        // For each pixel: the grains that could be here now are the ones whose homes lie up-wind, within Reach
        // cells, in this row or the one beside it (48 candidates; the picture is read only for the near ones).
        fragment: `
uniform float p_size;
uniform float p_fly;
uniform float p_reach;
uniform float p_speed;
uniform float p_angle;
uniform float p_dot;
uniform float p_floor;
uniform float p_keep;
uniform float p_lines;
uniform float p_streak;
float pt_hash(vec2 p, float k) { return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 17.31) * 43758.5453123); }
void main() {
    // the grid of dots lies along the wind: u runs with it, v across it
    float ang = p_angle * 0.0174533;
    vec2 wind = vec2(cos(ang), sin(ang));
    vec2 across = vec2(-wind.y, wind.x);
    vec2 px = uv / texel;
    float sx = max(p_streak, 1.0);
    vec2 g = vec2(dot(px, wind) / (p_size * sx), dot(px, across) / p_size);
    vec2 cellAt = floor(g);
    float reach = floor(p_reach + 0.5);
    float aa = 1.2 / p_size;
    vec3 col = vec3(0.0);
    float cover = 0.0;
    for (int j = -1; j <= 1; j++) {
        for (int k = -1; k <= 14; k++) {
            float fk = float(k);
            if (fk > reach) break;
            vec2 cell = cellAt + vec2(-fk, float(j));
            // where this dot lives, and whether it is one of the dots that fly
            vec2 home = cell + 0.5 + (vec2(pt_hash(cell, 1.0), pt_hash(cell, 2.0)) - 0.5) * 0.6;
            float flies = step(pt_hash(cell, 3.0), p_fly);
            float age = flies * fract(time * p_speed * (0.5 + pt_hash(cell, 4.0)) + pt_hash(cell, 5.0));
            // it leaves slowly and gathers speed, like dust taken by the wind
            vec2 pos = home + vec2(reach * age * age, (pt_hash(cell, 6.0) - 0.5) * 1.6 * age);
            // round at home; drawn out along the wind while it flies
            vec2 off = g - pos;
            off.x *= sx / (1.0 + 3.0 * age * step(1.5, sx));
            float d = length(off);
            if (d > 0.62) continue;
            vec2 at = (wind * home.x * sx + across * home.y) * p_size * texel;
            if (at.x < 0.0 || at.x > 1.0 || at.y < 0.0 || at.y > 1.0) continue;
            vec3 src = texture2D(a, at).rgb;
            float l = dot(src, vec3(0.299, 0.587, 0.114));
            float lit = smoothstep(p_floor, p_floor + 0.08, l);
            float r = p_dot * sqrt(clamp(l, 0.0, 1.0)) * (1.0 - 0.55 * age);
            float m = (1.0 - smoothstep(r - aa, r + aa, d)) * lit * (1.0 - age * age);
            if (m > cover) { cover = m; col = src / max(max(src.r, max(src.g, src.b)), 0.001) * max(l, 0.75); }
        }
    }
    // LINES: the nine grains around this pixel, at home, joined to each other where both are lit and near
    // enough. A grain that flies away leaves its line behind, so the mesh stays while the dust goes.
    float wire = 0.0;
    vec3 wireCol = vec3(0.0);
    if (p_lines > 0.01) {
        vec2 hp[9];
        float hl[9];
        vec3 hc[9];
        for (int n = 0; n < 9; n++) {
            vec2 cell = cellAt + vec2(mod(float(n), 3.0) - 1.0, floor(float(n) / 3.0) - 1.0);
            vec2 home = cell + 0.5 + (vec2(pt_hash(cell, 1.0), pt_hash(cell, 2.0)) - 0.5) * 0.6;
            vec2 at = clamp((wind * home.x * sx + across * home.y) * p_size * texel, 0.0, 1.0);
            vec3 src = texture2D(a, at).rgb;
            float l = dot(src, vec3(0.299, 0.587, 0.114));
            hp[n] = home;
            hl[n] = smoothstep(p_floor, p_floor + 0.08, l);
            hc[n] = src / max(max(src.r, max(src.g, src.b)), 0.001) * max(l, 0.75);
        }
        float thick = max(0.045, 0.75 / p_size);
        for (int i = 0; i < 9; i++) {
            for (int j = 0; j < 9; j++) {
                if (j <= i) continue;
                float both = hl[i] * hl[j];
                if (both < 0.02) continue;
                vec2 ab = hp[j] - hp[i];
                float len = length(ab);
                if (len > 1.5) continue;
                float t = clamp(dot(g - hp[i], ab) / (len * len), 0.0, 1.0);
                float d = length(g - (hp[i] + ab * t));
                float m = (1.0 - smoothstep(thick - aa * 0.5, thick + aa * 0.5, d)) * both * (1.0 - smoothstep(1.1, 1.5, len));
                if (m > wire) { wire = m; wireCol = mix(hc[i], hc[j], t); }
            }
        }
        wire *= p_lines;
    }
    vec3 under = texture2D(a, uv).rgb * p_keep;
    vec3 outc = mix(under, wireCol * 0.85, wire);
    gl_FragColor = vec4(mix(outc, col, cover), 1.0);
}`
    },

    'top.glitch': {
        label: 'Glitch',
        family: 'adjust',
        inputs: ['a'],
        // Reads `time` (the burst pattern changes `speed` times a second).
        animated: true,
        params: [
            param('amount', 'Amount', 0.4, 0, 1),
            param('speed', 'Speed', 8, 0, 30, 0.5),
            param('blocks', 'Blocks', 14, 2, 64, 1),
            param('split', 'RGB split', 0.3, 0, 1),
            param('scan', 'Scanlines', 0.3, 0, 1)
        ],
        // Deterministic: every value is a hash of the block and floor(time *
        // speed), never a random call, so the same time gives the same frame.
        // A block row/column cell is shoved sideways when its hash is under
        // Amount; the colour channels are read apart by RGB split; scanlines
        // darken every second pixel row.
        fragment: `
uniform float p_amount;
uniform float p_speed;
uniform float p_blocks;
uniform float p_split;
uniform float p_scan;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main() {
    float step_ = floor(time * p_speed);
    float aspect = texel.y / texel.x;
    vec2 cell = floor(uv * vec2(p_blocks * aspect, p_blocks));
    float on = step(hash21(cell + vec2(step_, 3.0)), p_amount);
    float row = floor(uv.y * p_blocks);
    float rowShove = (hash21(vec2(row, step_ + 7.0)) - 0.5) * 0.5 * step(hash21(vec2(row, step_)), p_amount * 0.5);
    float shove = on * (hash21(cell + vec2(step_, 9.0)) - 0.5) * 0.3 * p_amount + rowShove * p_amount;
    vec2 p = vec2(uv.x + shove, uv.y);
    float sp = p_split * 0.03 * (0.3 + on);
    float r = texture2D(a, vec2(p.x + sp, p.y)).r;
    float g = texture2D(a, p).g;
    float b = texture2D(a, vec2(p.x - sp, p.y)).b;
    float line = mod(floor(uv.y / texel.y), 2.0);
    vec3 c = vec3(r, g, b) * (1.0 - p_scan * 0.5 * line);
    gl_FragColor = vec4(c, 1.0);
}`
    },

    'top.blocks': {
        label: 'Blocks',
        family: 'adjust',
        inputs: ['a'],
        animated: true,
        params: [
            param('amount', 'Amount', 0.3, 0, 1),
            param('size', 'Size', 0.25, 0, 1),
            param('rate', 'Rate', 6, 0, 30, 0.5),
            param('shift', 'Shift', 0.5, 0, 1),
            param('hold', 'Hold', 0.5, 0, 1)
        ],
        // A broken video stream: the picture is cut into rectangles of mixed
        // sizes (a coarse grid, each cell split once or twice) and Amount of
        // them are broken. A broken block either keeps the OLD picture (reads
        // `self`, this operator's last output, like Freeze) or slides sideways
        // by up to Shift. The pattern steps Rate times a second and is a hash
        // of the block and the step, never a random call. Hold stretches how
        // many steps a block stays as it is (1 step at 0, up to 12 at 1). Colour
        // is left alone: grey comes from the effects placed before it.
        fragment: `
uniform sampler2D self;
uniform float p_amount;
uniform float p_size;
uniform float p_rate;
uniform float p_shift;
uniform float p_hold;
float hsh(vec2 p, float s) { return fract(sin(dot(p, vec2(127.1, 311.7)) + s * 74.7) * 43758.5453123); }
void main() {
    vec3 live = texture2D(a, uv).rgb;
    vec4 held = texture2D(self, uv);
    float aspect = texel.y / texel.x;
    vec2 q = vec2(uv.x * aspect, uv.y);
    float tick = floor(mod(time, 3600.0) * p_rate);
    vec2 cs = vec2(2.0, 1.0) * mix(0.03, 0.4, p_size);
    vec2 id = floor(q / cs);
    float life = 1.0 + floor(hsh(id, 2.0) * p_hold * 12.0);
    float ep = mod(floor((tick + floor(hsh(id, 1.0) * life)) / life), 509.0);
    for (int l = 0; l < 2; l++) {
        float r = hsh(id + float(l) * 17.0, ep + 3.0);
        if (r < 0.6) {
            float ax = hsh(id + float(l) * 17.0, ep + 4.0);
            vec2 f = ax < 0.4 ? vec2(2.0, 1.0) : (ax < 0.75 ? vec2(1.0, 2.0) : vec2(2.0, 2.0));
            cs = cs / f;
            id = floor(q / cs);
        }
    }
    if (hsh(id, ep + 50.0) >= p_amount) { gl_FragColor = vec4(live, 1.0); return; }
    if (hsh(id, ep + 70.0) < 0.5) {
        gl_FragColor = vec4(held.a > 0.5 ? held.rgb : live, 1.0);
    } else {
        float dx = (hsh(id, ep + 90.0) - 0.5) * 1.2 * p_shift;
        gl_FragColor = vec4(texture2D(a, vec2(fract(uv.x + dx), uv.y)).rgb, 1.0);
    }
}`
    },

    'top.pixelate': {
        label: 'Pixelate',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('size', 'Block size', 12, 1, 128, 1),
            param('levels', 'Posterize', 0, 0, 16, 1),
            toggle('grey', 'Grey')
        ],
        // A mosaic of Block size pixels, optionally posterised to Posterize
        // grey/colour steps (0 or 1 = off) and desaturated.
        fragment: `
${LUMA}
uniform float p_size;
uniform float p_levels;
uniform float p_grey;
void main() {
    vec2 cell = texel * max(p_size, 1.0);
    vec2 p = (floor(uv / cell) + 0.5) * cell;
    vec3 c = texture2D(a, min(p, vec2(1.0))).rgb;
    if (p_grey > 0.5) c = vec3(luma(c));
    if (p_levels > 1.5) c = floor(c * p_levels + 0.5) / p_levels;
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`
    },

    // --- TouchDesigner look operators (2026-11-10, feat-deck-td-effects.md):
    // the ones his own .toe files use most that di.iiii lacked. Spec table and
    // the TD operator each one answers: PROGRESS.md (the feat-deck-td-effects entry).

    'top.displace': {
        label: 'Displace',
        family: 'adjust',
        inputs: ['a', 'b'],
        animated: true,
        params: [
            choice('source', 'Map', ['Picture', 'Noise', 'Input B']),
            param('amountX', 'Amount X', 0, -0.5, 0.5, 0.005),
            param('amountY', 'Amount Y', 0, -0.5, 0.5, 0.005),
            param('scale', 'Noise scale', 4, 0.5, 40, 0.5),
            param('speed', 'Speed', 0.5, 0, 4, 0.05)
        ],
        // Moves each pixel by a map's red (x) and green (y), centred on 0.5, so a
        // flat mid-grey map moves nothing. The map is the picture itself, built-in
        // moving value noise (two decorrelated channels), or the second input.
        // Amounts are a fraction of the frame; 0 = no change. 2 map taps + 1 picture tap.
        fragment: `
uniform float p_source;
uniform float p_amountX;
uniform float p_amountY;
uniform float p_scale;
uniform float p_speed;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    vec2 m = vec2(0.5);
    if (p_source < 0.5) m = texture2D(a, uv).rg;
    else if (p_source < 1.5) {
        vec2 q = uv * p_scale + vec2(time * p_speed, time * p_speed * 0.7);
        m = vec2(vnoise(q), vnoise(q + vec2(17.3, 5.1)));
    } else m = texture2D(b, uv).rg;
    vec2 o = (m - 0.5) * 2.0 * vec2(p_amountX, p_amountY);
    gl_FragColor = vec4(texture2D(a, clamp(uv + o, 0.0, 1.0)).rgb, 1.0);
}`
    },

    'top.hsvadj': {
        label: 'Colour shift',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('hue', 'Hue', 0, -180, 180, 1),
            param('sat', 'Saturation', 1, 0, 2, 0.01),
            param('value', 'Value', 1, 0, 2, 0.01)
        ],
        // Rotate hue (degrees), scale saturation and value. Defaults = no change.
        fragment: `
uniform float p_hue;
uniform float p_sat;
uniform float p_value;
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
    vec3 hsv = rgb2hsv(texture2D(a, uv).rgb);
    hsv.x = fract(hsv.x + p_hue / 360.0);
    hsv.y = clamp(hsv.y * p_sat, 0.0, 1.0);
    hsv.z = clamp(hsv.z * p_value, 0.0, 1.0);
    gl_FragColor = vec4(hsv2rgb(hsv), 1.0);
}`
    },

    'top.mirror': {
        label: 'Mirror',
        family: 'adjust',
        inputs: ['a'],
        params: [
            choice('mode', 'Mirror', ['Off', 'Left to right', 'Right to left', 'Top to bottom', 'Bottom to top', 'Quad']),
            toggle('flipX', 'Flip X'),
            toggle('flipY', 'Flip Y')
        ],
        // Flip first, then fold: "Left to right" shows the left half twice, the
        // right one reflected. Quad folds both axes (a four-way kaleidoscope-like
        // look). One picture tap. Off + no flip = no change.
        fragment: `
uniform float p_mode;
uniform float p_flipX;
uniform float p_flipY;
void main() {
    vec2 p = uv;
    if (p_flipX > 0.5) p.x = 1.0 - p.x;
    if (p_flipY > 0.5) p.y = 1.0 - p.y;
    bool lr = p_mode > 0.5 && p_mode < 1.5;
    bool rl = p_mode > 1.5 && p_mode < 2.5;
    bool tb = p_mode > 2.5 && p_mode < 3.5;
    bool bt = p_mode > 3.5 && p_mode < 4.5;
    bool quad = p_mode > 4.5;
    if ((lr || quad) && p.x > 0.5) p.x = 1.0 - p.x;
    if (rl && p.x < 0.5) p.x = 1.0 - p.x;
    // uv is bottom-up: "top" is y > 0.5.
    if (tb && p.y < 0.5) p.y = 1.0 - p.y;
    if ((bt || quad) && p.y > 0.5) p.y = 1.0 - p.y;
    gl_FragColor = vec4(texture2D(a, p).rgb, 1.0);
}`
    },

    'top.key': {
        label: 'Key',
        family: 'adjust',
        inputs: ['a'],
        params: [
            choice('mode', 'Mode', ['Chroma', 'Luma']),
            colour('colour', 'Key colour', '#00ff00'),
            param('tolerance', 'Tolerance', 0.3, 0, 1),
            param('soft', 'Softness', 0.1, 0, 0.5)
        ],
        // There is no alpha in the pipeline (canvas alpha: false), so a key goes
        // to BLACK: pair it with the Add / Screen / Lighten layer blend and the
        // keyed part shows what is below. Chroma: distance of the Cb/Cr pair from
        // the key colour (ignores how bright it is). Luma: pixels darker than
        // Tolerance go to black (Key colour unused). 1 picture tap.
        fragment: `
${LUMA}
uniform float p_mode;
uniform vec3 p_colour;
uniform float p_tolerance;
uniform float p_soft;
vec2 cbcr(vec3 c) { return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
void main() {
    vec3 c = texture2D(a, uv).rgb;
    float s = max(p_soft, 0.0001);
    float keep;
    if (p_mode < 0.5) keep = smoothstep(p_tolerance, p_tolerance + s, length(cbcr(c) - cbcr(p_colour)));
    else keep = smoothstep(p_tolerance - s, p_tolerance + s, luma(c));
    gl_FragColor = vec4(c * keep, 1.0);
}`
    },

    'top.lookup': {
        label: 'Grade',
        family: 'adjust',
        inputs: ['a'],
        params: [
            colour('shadows', 'Shadows', '#0b1033'),
            colour('mids', 'Mids', '#b0306a'),
            colour('highs', 'Highlights', '#ffd9a0'),
            param('amount', 'Amount', 1, 0, 1)
        ],
        // The picture's brightness looked up in a three-colour ramp (TD lookup with
        // a ramp): 0 -> Shadows, 0.5 -> Mids, 1 -> Highlights. Amount 0 = no change.
        fragment: `
${LUMA}
uniform vec3 p_shadows;
uniform vec3 p_mids;
uniform vec3 p_highs;
uniform float p_amount;
void main() {
    vec3 src = texture2D(a, uv).rgb;
    float l = clamp(luma(src), 0.0, 1.0);
    vec3 ramp = l < 0.5 ? mix(p_shadows, p_mids, l * 2.0) : mix(p_mids, p_highs, (l - 0.5) * 2.0);
    gl_FragColor = vec4(mix(src, ramp, p_amount), 1.0);
}`
    },

    'top.slope': {
        label: 'Emboss',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('strength', 'Strength', 1, 0, 4),
            param('angle', 'Light angle', 135, 0, 360, 1),
            param('size', 'Depth px', 1.5, 0.5, 8, 0.5),
            param('keep', 'Keep colour', 0, 0, 1)
        ],
        // Brightness slope along the light direction (two taps either side) added
        // to mid grey: a relief. Keep colour mixes the original back under it.
        fragment: `
${LUMA}
uniform float p_strength;
uniform float p_angle;
uniform float p_size;
uniform float p_keep;
void main() {
    float r = radians(p_angle);
    vec2 o = vec2(cos(r), sin(r)) * texel * p_size;
    float d = luma(texture2D(a, clamp(uv + o, 0.0, 1.0)).rgb) - luma(texture2D(a, clamp(uv - o, 0.0, 1.0)).rgb);
    vec3 relief = vec3(clamp(0.5 + d * p_strength * 2.0, 0.0, 1.0));
    vec3 src = texture2D(a, uv).rgb;
    gl_FragColor = vec4(mix(relief, clamp(src + (relief - 0.5), 0.0, 1.0), p_keep), 1.0);
}`
    },

    'top.glow': {
        label: 'Glow',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('threshold', 'Threshold', 0.6, 0, 0.95),
            param('radius', 'Radius px', 12, 1, 64, 1),
            param('amount', 'Amount', 1, 0, 4)
        ],
        // Bloom in one pass: 12 taps on a golden-angle disc plus the centre (13
        // picture taps) keep only what is brighter than Threshold, average it and
        // add it back. Few taps means grain at large Radius; Amount 0 = no change.
        fragment: `
${LUMA}
uniform float p_threshold;
uniform float p_radius;
uniform float p_amount;
vec3 bright(vec3 c) { return max(c - vec3(p_threshold), 0.0) / max(1.0 - p_threshold, 0.05); }
void main() {
    vec3 src = texture2D(a, uv).rgb;
    vec3 acc = bright(src);
    for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float ang = fi * 2.39996;
        float rad = sqrt((fi + 0.5) / 12.0) * p_radius;
        vec2 o = vec2(cos(ang), sin(ang)) * rad * texel;
        acc += bright(texture2D(a, clamp(uv + o, 0.0, 1.0)).rgb);
    }
    gl_FragColor = vec4(clamp(src + acc / 13.0 * p_amount, 0.0, 1.0), 1.0);
}`
    },

    'top.blend': {
        label: 'Blend',
        family: 'combine',
        inputs: ['a', 'b'],
        params: [
            choice('mode', 'Mode', ['Mix', 'Add', 'Screen', 'Multiply', 'Difference', 'Subtract', 'Lighten', 'Darken', 'Overlay']),
            param('mix', 'Amount', 1, 0, 1)
        ],
        // a = what is below, b = what is blended in. Subtract is a - b; Overlay
        // multiplies the dark parts of a and screens the light ones.
        fragment: `
uniform float p_mode;
uniform float p_mix;
void main() {
    vec3 x = texture2D(a, uv).rgb;
    vec3 y = texture2D(b, uv).rgb;
    vec3 c = y;
    if (p_mode > 0.5 && p_mode < 1.5) c = x + y;
    else if (p_mode > 1.5 && p_mode < 2.5) c = 1.0 - (1.0 - x) * (1.0 - y);
    else if (p_mode > 2.5 && p_mode < 3.5) c = x * y;
    else if (p_mode > 3.5 && p_mode < 4.5) c = abs(x - y);
    else if (p_mode > 4.5 && p_mode < 5.5) c = x - y;
    else if (p_mode > 5.5 && p_mode < 6.5) c = max(x, y);
    else if (p_mode > 6.5 && p_mode < 7.5) c = min(x, y);
    else if (p_mode > 7.5) c = mix(2.0 * x * y, 1.0 - 2.0 * (1.0 - x) * (1.0 - y), step(0.5, x));
    gl_FragColor = vec4(clamp(mix(x, c, p_mix), 0.0, 1.0), 1.0);
}`
    },

    // --- generators (2026-09-20): the operators a picture network can START
    // from besides a camera. "Noise" and "Transform" are already taken by
    // other families' node labels (value.noise, geom.transform) — the
    // vocabulary contract gives one word one meaning, so these read as
    // Clouds and Reframe instead; the type ids keep the TouchDesigner names
    // they were asked for.

    'top.noise': {
        label: 'Clouds',
        family: 'in',
        inputs: [],
        // Reads `time` — must be redrawn every frame regardless of its params.
        animated: true,
        params: [
            param('scale', 'Scale', 4, 0.5, 20, 0.1),
            param('speed', 'Speed', 0.06, 0, 2, 0.01),
            choice('detail', 'Detail', ['1', '2', '3', '4'], 2),
            param('contrast', 'Contrast', 1.2, 0.2, 4, 0.05),
            toggle('colour', 'Colour')
        ],
        // Value noise (bilinear hash lattice) summed as an fbm, up to 4
        // octaves picked at runtime by masking rather than a dynamic loop
        // bound — WebGL1 compilers on old drivers can refuse the latter. 4
        // taps per octave, 4 octaves: 16 texture-free hashes, well under the
        // "no loops over 8 iterations" budget per iteration of the outer loop.
        fragment: `
uniform float p_scale;
uniform float p_speed;
uniform float p_detail;
uniform float p_contrast;
uniform float p_colour;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
// A warm-leaning cosine palette (Inigo Quilez's formula) — cheap, and never
// passes through literal white the way three independent noise samples could.
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (vec3(0.9, 0.6, 0.35) * t + vec3(0.0, 0.15, 0.35))); }
void main() {
    vec2 p = uv * p_scale + vec2(time * p_speed, time * p_speed * 0.7);
    float octaves = p_detail + 1.0;
    float amp = 0.5;
    float freq = 1.0;
    float n = 0.0;
    for (int i = 0; i < 4; i += 1) {
        if (float(i) < octaves) {
            n += valueNoise(p * freq) * amp;
            freq *= 2.0;
            amp *= 0.5;
        }
    }
    n = clamp((n - 0.5) * p_contrast + 0.5, 0.0, 1.0);
    vec3 c = p_colour > 0.5 ? palette(n) : vec3(n);
    gl_FragColor = vec4(c, 1.0);
}`
    },

    'top.ramp': {
        label: 'Gradient',
        family: 'in',
        inputs: [],
        params: [
            choice('type', 'Type', ['Horizontal', 'Vertical', 'Radial', 'Circular sweep']),
            // Offset is a plain 0..1 wrap — safe for a hand to drag, and just
            // as safe for a script or a wired number to sweep every frame.
            param('offset', 'Offset', 0, 0, 1),
            colour('a', 'Colour A', '#1a0500'),
            colour('b', 'Colour B', '#a03c00')
        ],
        fragment: `
uniform float p_type;
uniform float p_offset;
uniform vec3 p_a;
uniform vec3 p_b;
void main() {
    vec2 c = uv - 0.5;
    float t;
    if (p_type < 0.5) t = uv.x;
    else if (p_type < 1.5) t = uv.y;
    // sqrt(0.5) normalises the corner-to-corner distance back to ~1.
    else if (p_type < 2.5) t = length(c) * 1.4142135;
    else t = atan(c.y, c.x) / 6.28318 + 0.5;
    t = fract(t + p_offset);
    gl_FragColor = vec4(mix(p_a, p_b, t), 1.0);
}`
    },

    'top.tint': {
        label: 'Tint',
        family: 'adjust',
        inputs: ['a'],
        // Defaults black -> deep amber: the duotone that makes any picture
        // club-safe warm with the card untouched.
        params: [
            colour('dark', 'Dark', '#000000'),
            colour('bright', 'Bright', '#ff7a1a'),
            param('amount', 'Amount', 1, 0, 1)
        ],
        fragment: `
${LUMA}
uniform vec3 p_dark;
uniform vec3 p_bright;
uniform float p_amount;
void main() {
    vec3 src = texture2D(a, uv).rgb;
    vec3 duo = mix(p_dark, p_bright, luma(src));
    gl_FragColor = vec4(mix(src, duo, p_amount), 1.0);
}`
    },

    'top.transform': {
        label: 'Reframe',
        family: 'adjust',
        inputs: ['a'],
        params: [
            param('scale', 'Scale', 1, 0.1, 4, 0.01),
            param('rotate', 'Rotate', 0, -180, 180, 1),
            param('moveX', 'Move X', 0, -1, 1),
            param('moveY', 'Move Y', 0, -1, 1),
            choice('edge', 'Edge', ['Black', 'Repeat', 'Mirror'])
        ],
        // Centre-anchored: scale, then rotate, then pan, all in the space
        // around (0.5, 0.5). Wired into a Feedback loop (the engine reads a
        // drawn cycle as feedback, not an error — orderNetwork.js), this is
        // what makes a tunnel: each frame reframes the last.
        fragment: `
uniform float p_scale;
uniform float p_rotate;
uniform float p_moveX;
uniform float p_moveY;
uniform float p_edge;
void main() {
    vec2 c = (uv - 0.5) / max(p_scale, 0.0001);
    float rad = radians(-p_rotate);
    float s = sin(rad);
    float co = cos(rad);
    c = mat2(co, -s, s, co) * c;
    c -= vec2(p_moveX, p_moveY);
    vec2 pos = c + 0.5;
    vec3 col;
    if (p_edge < 0.5) {
        bool outside = pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0;
        col = outside ? vec3(0.0) : texture2D(a, pos).rgb;
    } else if (p_edge < 1.5) {
        col = texture2D(a, fract(pos)).rgb;
    } else {
        col = texture2D(a, abs(mod(pos, 2.0) - 1.0)).rgb;
    }
    gl_FragColor = vec4(col, 1.0);
}`
    },

    // Steady: the hand shake taken out of a camera picture. The engine measures how far each new frame
    // jumped (steadyMotion.js) and hands the correction in as steady_offset; this only reads the picture
    // there, zoomed in by `zoom` so the moving edge stays out of sight. Translation only.
    'top.steady': {
        label: 'Steady',
        family: 'adjust',
        inputs: ['a'],
        steady: true,
        params: [
            param('smooth', 'Smoothing', 0.5, 0, 1),
            param('zoom', 'Zoom', 1.1, 1, 1.4, 0.01),
            param('reach', 'Max shift', 0.06, 0, 0.15, 0.005)
        ],
        fragment: `
uniform float p_zoom;
uniform vec2 steady_offset;
void main() {
    vec2 pos = (uv - 0.5) / max(p_zoom, 1.0) + 0.5 + steady_offset;
    gl_FragColor = vec4(texture2D(a, clamp(pos, vec2(0.0), vec2(1.0))).rgb, 1.0);
}`
    },

    'top.shape': {
        label: 'Shape',
        family: 'in',
        inputs: [],
        // Reads `time` for Spin — must be redrawn every frame.
        animated: true,
        params: [
            choice('shape', 'Shape', ['Circle', 'Ring', 'Bar', 'Grid of dots']),
            param('size', 'Size', 0.4, 0.05, 1.5, 0.01),
            param('softness', 'Softness', 0.08, 0, 0.5, 0.01),
            param('count', 'Count', 6, 2, 20, 1),
            param('spin', 'Spin speed', 0.15, -3, 3, 0.01),
            // White-on-black would be a fine mask, but a bare Shape is often
            // the whole picture — dim amber so it is never a flash of white.
            colour('colour', 'Colour', '#66310a')
        ],
        fragment: `
uniform float p_shape;
uniform float p_size;
uniform float p_softness;
uniform float p_count;
uniform float p_spin;
uniform vec3 p_colour;
float soft(float d, float r, float s) { return 1.0 - smoothstep(r - s, r + s, d); }
void main() {
    vec2 c = uv - 0.5;
    float ang = p_spin * time;
    float sn = sin(ang);
    float cs = cos(ang);
    c = mat2(cs, -sn, sn, cs) * c;
    float r = max(p_size, 0.001) * 0.5;
    float sft = max(p_softness, 0.001);
    float m;
    if (p_shape < 0.5) {
        m = soft(length(c), r, sft);
    } else if (p_shape < 1.5) {
        m = clamp(soft(length(c), r, sft) - soft(length(c), r * 0.5, sft), 0.0, 1.0);
    } else if (p_shape < 2.5) {
        m = soft(abs(c.y), r, sft);
    } else {
        vec2 cell = fract(c * max(p_count, 1.0) + 0.5) - 0.5;
        m = soft(length(cell), r * 0.5, sft);
    }
    gl_FragColor = vec4(p_colour * m, 1.0);
}`
    },

    'top.out': {
        label: 'Picture Out',
        family: 'out',
        inputs: ['a'],
        params: [],
        // What the projector shows. A pass-through, so the output page never has
        // to know which operator happens to be last.
        fragment: `
void main() { gl_FragColor = vec4(texture2D(a, uv).rgb, 1.0); }`
    },

    'top.send': {
        label: 'Send Out',
        family: 'out',
        inputs: ['a'],
        // The picture leaves the machine that draws it, as a source other stage
        // software on the LAN can pick up by this name (pictureOut.js posts the
        // frames; serverXR's /ndi/out.jpg speaks NDI®). No name, no sending —
        // the empty default is the quiet path, and it costs nothing.
        //
        // The operator is called Send Out and not "NDI Out" on purpose: NDI is
        // what we speak on the wire, not what we are, and naming a feature
        // after it is the one thing the trademark terms do not allow us
        // (docs/architecture/NDI.md).
        params: [text('name', 'Called on the network')],
        // What must sit beside the box where a person types that name. We never
        // ship the NDI runtime — the person installs it — and this line plus
        // the link are the terms on which we may name it at all. A licence
        // condition, not decoration; the inspector draws it, its test guards it.
        attribution: {
            text: 'Sends this picture to the network as an NDI source, from the machine it runs on. That machine needs the NDI runtime from',
            href: 'https://ndi.video',
            label: 'ndi.video',
            after: 'NDI® is a registered trademark of Vizrt NDI AB.'
        },
        // The same pass-through as Picture Out: the sender reads this
        // operator's own slot, so what is wired in is what goes out.
        fragment: `
void main() { gl_FragColor = vec4(texture2D(a, uv).rgb, 1.0); }`
    },

    'top.analyze': {
        label: 'Analyze',
        family: 'analyse',
        inputs: ['a'],
        // Picture → numbers (TOP → CHOP). The engine reads a 32x18 copy of the
        // input back to the CPU a few times a second and computes these.
        measure: ['brightness', 'amount', 'x', 'y'],
        params: [param('threshold', 'Counts as lit above', 0.2, 0, 1)],
        fragment: `
void main() { gl_FragColor = vec4(texture2D(a, uv).rgb, 1.0); }`
    }
}

export const TOP_TYPE_IDS = Object.keys(TOP_OPERATORS)

const INPUT_LABELS = { a: 'In', b: 'In B' }

// Which machine computes this operator. Empty is "wherever the page is open" —
// every machine runs its own copy, the way a patch behaves on one laptop. The
// editor fills in the machines it can see in the space (machineLink.js); the
// registry only knows the one choice that is always true.
export const RUNS_ON_ANYWHERE = ''
const RUNS_ON = {
    id: 'machine',
    type: 'string',
    label: 'Runs on',
    options: [{ value: RUNS_ON_ANYWHERE, label: 'Where the page is open' }]
}

const PICK_CAMERA = {
    id: 'device',
    type: 'string',
    label: 'Camera',
    options: [{ value: '', label: 'Its default camera' }]
}

// Already an inspector field (it carries `path`), so the sheet passes it
// through as the same asset picker a Video node's file uses.
const PICK_ASSET = (assetKind) => ({ id: 'asset', label: 'Clip', path: ['asset'], type: 'asset', portType: 'string', assetKind })

/** Does THIS machine compute the operator? Unknown machine → only anywhere-operators. */
export const runsHere = (values, machineId) => {
    const target = values?.machine || RUNS_ON_ANYWHERE
    return target === RUNS_ON_ANYWHERE || (Boolean(machineId) && target === machineId)
}
const MEASURE_LABELS = { brightness: 'Brightness', amount: 'Amount', x: 'Centre X', y: 'Centre Y' }

/**
 * The operators as node types, for nodeRegistry.js. Built from the operator
 * table so a new operator is ONE entry above, not a shader here and a
 * hand-copied port list there.
 *
 * Parameters are settings (configInputs), not ports: a Level with six sockets
 * would be a tall card of wires nobody drew. Pictures are ports — that is what
 * gets wired.
 */
export const buildTopNodeTypes = () => Object.fromEntries(Object.entries(TOP_OPERATORS).map(([id, operator]) => [id, {
    id,
    label: operator.label,
    category: 'picture',
    runtime: 'web',
    singleton: false,
    keywords: ['picture', 'image', 'top', 'operator', 'video', 'shader', operator.family, ...operator.label.toLowerCase().split(' ')],
    inputs: operator.inputs.map((name) => ({ id: name, type: 'texture', label: INPUT_LABELS[name] || name })),
    outputs: [
        { id: 'out', type: 'texture', label: 'Picture' },
        ...(operator.measure || []).map((name) => ({ id: name, type: 'number', label: MEASURE_LABELS[name] || name }))
    ],
    defaultValues: {
        machine: '',
        ...(operator.pickDevice ? { device: '', deviceLabel: '' } : {}),
        ...(operator.pickAsset ? { asset: '' } : {}),
        ...(operator.state || {}),
        ...Object.fromEntries(operator.params.map((p) => [p.name, p.toggle ? Boolean(p.value) : (p.options ? String(p.value) : p.value)]))
    },
    configInputs: [RUNS_ON, ...(operator.pickDevice ? [PICK_CAMERA] : []), ...(operator.pickAsset ? [PICK_ASSET(operator.pickAsset)] : []), ...operator.params.map((p) => (
        p.colour
            ? { id: p.name, type: 'color', label: p.label }
            : p.text
                // A plain box. The attribution rides with the field so it is
                // drawn beside the box itself, wherever that box ends up.
                ? { id: p.name, type: 'string', label: p.label, maxLength: TEXT_MAX, ...(operator.attribution ? { note: operator.attribution } : {}) }
            : p.toggle
                ? { id: p.name, type: 'boolean', label: p.label }
                : p.options
                    ? { id: p.name, type: 'string', label: p.label, options: p.options.map((label, index) => ({ value: String(index), label })) }
                    : { id: p.name, type: 'number', label: p.label, min: p.min, max: p.max, step: p.step }
    ))],
    // A card with a picture on it; no window, nothing in the room.
    render: 'hidden'
}]))

export const isTopType = (typeId) => Object.prototype.hasOwnProperty.call(TOP_OPERATORS, typeId)

/** Does this operator post its picture to the network (a Send Out)? */
export const sendsOut = (typeId) => typeId === 'top.send'

const HEX_RE = /^#[0-9a-f]{6}$/i

/** Parameter values for a node, defaults filled in and clamped to range.
 * A colour parameter stays a '#rrggbb' string — there is no range to clamp
 * it to — and falls back to its default rather than to black, so a stored
 * value nobody wrote yet (or a bad one) reads as the operator's own choice.
 * A text parameter stays a string too, trimmed and capped at 200 characters
 * (the server's own limit on a name); anything that is not a string falls
 * back to the default rather than becoming the word "undefined" on a network. */
export const resolveTopParams = (typeId, values = {}) => {
    const operator = TOP_OPERATORS[typeId]
    if (!operator) return {}
    const out = {}
    for (const p of operator.params) {
        if (p.colour) {
            const raw = values?.[p.name]
            out[p.name] = typeof raw === 'string' && HEX_RE.test(raw) ? raw : p.value
            continue
        }
        if (p.text) {
            const raw = values?.[p.name]
            out[p.name] = (typeof raw === 'string' ? raw : p.value).trim().slice(0, TEXT_MAX)
            continue
        }
        const raw = Number(values?.[p.name])
        out[p.name] = Number.isFinite(raw) ? Math.min(p.max, Math.max(p.min, raw)) : p.value
    }
    return out
}

/**
 * Numbers from a small RGBA readback: mean brightness, the fraction above a
 * threshold, and the centre of the lit part (0..1, x left→right, y top→bottom).
 * Pure, so it is tested without a GPU.
 */
export const measurePixels = (pixels, width, height, threshold = 0.2, { bottomUp = true } = {}) => {
    let sum = 0
    let lit = 0
    let sx = 0
    let sy = 0
    let weight = 0
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4
            const l = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255
            sum += l
            if (l > threshold) {
                lit += 1
                sx += (x + 0.5) * l
                sy += ((bottomUp ? height - 1 - y : y) + 0.5) * l
                weight += l
            }
        }
    }
    const count = width * height
    return {
        brightness: count ? sum / count : 0,
        amount: count ? lit / count : 0,
        x: weight ? sx / weight / width : 0.5,
        y: weight ? sy / weight / height : 0.5
    }
}
