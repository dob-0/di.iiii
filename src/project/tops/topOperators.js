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

    'top.blend': {
        label: 'Blend',
        family: 'combine',
        inputs: ['a', 'b'],
        params: [
            choice('mode', 'Mode', ['Mix', 'Add', 'Screen', 'Multiply', 'Difference']),
            param('mix', 'Amount', 1, 0, 1)
        ],
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
    else if (p_mode > 3.5) c = abs(x - y);
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
        ...Object.fromEntries(operator.params.map((p) => [p.name, p.toggle ? Boolean(p.value) : (p.options ? String(p.value) : p.value)]))
    },
    configInputs: [RUNS_ON, ...(operator.pickDevice ? [PICK_CAMERA] : []), ...operator.params.map((p) => (
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
