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

const LUMA = 'float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }'

const param = (name, label, value, min, max, step = 0.01) => ({ name, label, value, min, max, step })
// A switch or a menu is still a number to the shader; `options` only changes
// how the inspector draws it.
const toggle = (name, label, value = 0) => ({ name, label, value, min: 0, max: 1, step: 1, toggle: true })
const choice = (name, label, options, value = 0) => ({ name, label, value, min: 0, max: options.length - 1, step: 1, options })

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
        p.toggle
            ? { id: p.name, type: 'boolean', label: p.label }
            : p.options
                ? { id: p.name, type: 'string', label: p.label, options: p.options.map((label, index) => ({ value: String(index), label })) }
                : { id: p.name, type: 'number', label: p.label, min: p.min, max: p.max, step: p.step }
    ))],
    // A card with a picture on it; no window, nothing in the room.
    render: 'hidden'
}]))

export const isTopType = (typeId) => Object.prototype.hasOwnProperty.call(TOP_OPERATORS, typeId)

/** Parameter values for a node, defaults filled in and clamped to range. */
export const resolveTopParams = (typeId, values = {}) => {
    const operator = TOP_OPERATORS[typeId]
    if (!operator) return {}
    const out = {}
    for (const p of operator.params) {
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
