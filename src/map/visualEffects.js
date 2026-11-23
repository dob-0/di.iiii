// VISUAL EFFECTS — the mapper's clip and composition effects, after Resolume.
//
// An effect is stored as { id, type, on, params } (normalizeMappingEffects in
// projectSchema.js keeps it bounded); THIS file is what each type means. A
// visual's own effects are its clip effects and stay with it, whatever it is
// playing on. The mapping's `effects` are the composition effects: they apply
// to the wall picture, after the clip's own, on every screen that shows the
// wall. A screen that plays one visual alone takes the clip's effects only —
// in Resolume a slice fed straight from a layer skips the composition too.
//
// Two ways an effect is drawn:
//  - gl:  a fragment shader in the mesh renderer's effect pass
//         (meshRenderer.js). Every visual the mesh can read — video, image,
//         camera, test card, colour and uploaded HTML through the frame relay
//         — goes this way, so every effect here works on them.
//  - css: a CSS filter / transform / overlay on the visual's element
//         (MapFxDom.jsx). A web link or a di project is a page nobody may read
//         as pixels, so it only gets the effects that have a `css` form.
//
// Params are in units a person thinks in (degrees, wall pixels, Hz), never
// in texture units: an effect looks the same on the desk's small monitor and
// on the 3200-pixel wall, because sizes are counted in the WALL's pixels.
//
// Time: phases are worked out here, in double precision, from the wall clock,
// so a desk and the output on one machine strobe together and a shader never
// holds a large float.

import { generateId } from '../shared/projectSchema.js'
import { deskBeat } from './deskBeat.js'
import { anyLfoMoving, valuesAt } from './paramLfo.js'

const TAU = Math.PI * 2
const rad = (deg) => (deg * Math.PI) / 180
const wrapDeg = (deg) => ((deg % 360) + 360) % 360
const frac = (value) => value - Math.floor(value)
// The shaders' hash11, in JS, for effects whose randomness is decided per frame here.
const jsHash = (n) => frac(Math.sin(n * 127.1) * 43758.5453)

export const effectClock = () => (Date.now() % 86400000) / 1000

const hexRgb = (hex = '#ffffff') => {
    const clean = String(hex).replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0')
    const n = Number.parseInt(full.slice(0, 6), 16) || 0
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const num = (key, label, min, max, step, value, unit = '') => ({ key, label, kind: 'number', min, max, step, default: value, unit })
// A setting that is itself a speed: its phase is rate × the wall clock, so an
// LFO on it would throw the picture about. No LFO (paramLfo.js).
const rateNum = (...args) => ({ ...num(...args), rate: true })
const choice = (key, label, options, value) => ({ key, label, kind: 'choice', options, default: value })
const colour = (key, label, value) => ({ key, label, kind: 'colour', default: value })

export const EFFECT_GROUPS = [
    { id: 'colour', label: 'Colour' },
    { id: 'transform', label: 'Transform' },
    { id: 'distort', label: 'Distort' },
    { id: 'stylize', label: 'Stylize' },
    { id: 'key', label: 'Key' },
    { id: 'time', label: 'Time' }
]

// Colour Strobe's colour and on/off at a beat: one colour per round, in turn.
const STROBE_COLOURS = {
    neon: ['#ff1fb4', '#1f3dff', '#ffffff', '#8a00ff'],
    warhol: ['#ff2a8a', '#ffd400', '#29c4ff', '#ff6a00'],
    rgb: ['#ff0000', '#00ff00', '#0000ff'],
    white: ['#ffffff']
}
export const strobeColourAt = (p, beat) => {
    const every = Number(p.every) || 1
    const round = beat / every
    const list = STROBE_COLOURS[p.colours] || STROBE_COLOURS.neon
    const index = ((Math.floor(round) % list.length) + list.length) % list.length
    const hex = list[index]
    return { hex, rgb: hexRgb(hex), on: frac(round) < p.duty }
}

// Each shader body defines `vec4 effect(vec2 uv)`. Available to it:
//   u_input (sampler2D, the picture so far), u_size (wall pixels of the
//   frame), u_a, u_b (vec4 params from `uniforms`), u_pass (0, 1 …),
//   pick(uv) (transparent outside 0..1), fold(uv) (mirror-repeat), luma(rgb),
//   hash11(n), hash12(p) (0..1 noise).
const EFFECTS = [
    // --- colour --------------------------------------------------------
    {
        type: 'hue',
        label: 'Hue Rotate',
        group: 'colour',
        params: [num('hue', 'Hue', 0, 360, 1, 90, '°'), rateNum('speed', 'Speed', -360, 360, 1, 0, '°/s')],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [rad(wrapDeg(p.hue + (p.speed * t))), 0, 0, 0] }),
        // The CSS hue-rotate matrix exactly, so a web link and a video turn alike.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float s = sin(u_a.x);
    float k = cos(u_a.x);
    mat3 m = mat3(
        0.213 + k * 0.787 - s * 0.213, 0.213 - k * 0.213 + s * 0.143, 0.213 - k * 0.213 - s * 0.787,
        0.715 - k * 0.715 - s * 0.715, 0.715 + k * 0.285 + s * 0.140, 0.715 - k * 0.715 + s * 0.715,
        0.072 - k * 0.072 + s * 0.928, 0.072 - k * 0.072 - s * 0.283, 0.072 + k * 0.928 + s * 0.072);
    return vec4(clamp(m * c.rgb, 0.0, 1.0), c.a);
}`,
        css: (p, t) => ({ filter: `hue-rotate(${wrapDeg(p.hue + (p.speed * t)).toFixed(2)}deg)` })
    },
    {
        type: 'saturation',
        label: 'Saturation',
        group: 'colour',
        params: [num('amount', 'Amount', 0, 4, 0.01, 1.5)],
        uniforms: (p) => ({ a: [p.amount, 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec3 l = vec3(dot(c.rgb, vec3(0.213, 0.715, 0.072)));
    return vec4(clamp(mix(l, c.rgb, u_a.x), 0.0, 1.0), c.a);
}`,
        css: (p) => ({ filter: `saturate(${p.amount})` })
    },
    {
        type: 'brightContrast',
        label: 'Brightness / Contrast',
        group: 'colour',
        params: [num('brightness', 'Brightness', -1, 1, 0.01, 0), num('contrast', 'Contrast', 0, 4, 0.01, 1.4)],
        uniforms: (p) => ({ a: [1 + p.brightness, p.contrast, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec3 rgb = c.rgb * u_a.x;
    rgb = ((rgb - 0.5) * u_a.y) + 0.5;
    return vec4(clamp(rgb, 0.0, 1.0), c.a);
}`,
        css: (p) => ({ filter: `brightness(${1 + p.brightness}) contrast(${p.contrast})` })
    },
    {
        type: 'invert',
        label: 'Invert',
        group: 'colour',
        params: [num('amount', 'Amount', 0, 1, 0.01, 1)],
        uniforms: (p) => ({ a: [p.amount, 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    return vec4(mix(c.rgb, 1.0 - c.rgb, u_a.x), c.a);
}`,
        css: (p) => ({ filter: `invert(${p.amount})` })
    },
    {
        type: 'mono',
        label: 'Black & White',
        group: 'colour',
        params: [num('amount', 'Amount', 0, 1, 0.01, 1)],
        uniforms: (p) => ({ a: [p.amount, 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    return vec4(mix(c.rgb, vec3(luma(c.rgb)), u_a.x), c.a);
}`,
        css: (p) => ({ filter: `grayscale(${p.amount})` })
    },
    {
        type: 'colorize',
        label: 'Colorize',
        group: 'colour',
        params: [colour('colour', 'Colour', '#ff2a55'), num('amount', 'Amount', 0, 1, 0.01, 1)],
        uniforms: (p) => ({ a: [...hexRgb(p.colour), p.amount] }),
        // Dark stays black, the middle takes the colour, light goes white.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float l = luma(c.rgb);
    vec3 t = u_a.rgb;
    vec3 tinted = l < 0.5 ? 2.0 * l * t : 1.0 - (2.0 * (1.0 - l) * (1.0 - t));
    return vec4(mix(c.rgb, tinted, u_a.a), c.a);
}`,
        css: (p) => ({ overlay: { background: p.colour, mixBlendMode: 'color', opacity: p.amount } })
    },
    {
        type: 'threshold',
        label: 'Threshold',
        group: 'colour',
        params: [num('level', 'Level', 0, 1, 0.01, 0.3), num('soft', 'Softness', 0, 0.5, 0.01, 0.02)],
        uniforms: (p) => ({ a: [p.level, Math.max(0.0001, p.soft), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float v = smoothstep(u_a.x - u_a.y, u_a.x + u_a.y, luma(c.rgb));
    return vec4(vec3(v), c.a);
}`
    },
    {
        type: 'posterize',
        label: 'Posterize',
        group: 'colour',
        params: [num('levels', 'Levels', 2, 16, 1, 4)],
        uniforms: (p) => ({ a: [Math.max(2, Math.round(p.levels)), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec3 q = floor(c.rgb * (u_a.x - 0.0001)) / (u_a.x - 1.0);
    return vec4(clamp(q, 0.0, 1.0), c.a);
}`
    },

    // --- transform -----------------------------------------------------
    {
        type: 'transform',
        label: 'Transform',
        group: 'transform',
        params: [
            num('x', 'Position X', -1, 1, 0.001, 0),
            num('y', 'Position Y', -1, 1, 0.001, 0),
            num('scale', 'Scale', 0.05, 8, 0.01, 1),
            num('rotate', 'Rotation', -180, 180, 0.1, 0, '°'),
            rateNum('spin', 'Spin', -360, 360, 1, 0, '°/s')
        ],
        animated: (p) => p.spin !== 0,
        uniforms: (p, t) => ({ a: [p.x, p.y, Math.max(0.05, p.scale), rad(wrapDeg(p.rotate + (p.spin * t)))] }),
        // Scale, then turn, then move — about the middle, in square pixels.
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 p = (uv - 0.5 - u_a.xy) * vec2(aspect, 1.0);
    float c = cos(u_a.w);
    float s = sin(u_a.w);
    p = vec2((c * p.x) + (s * p.y), (-s * p.x) + (c * p.y)) / u_a.z;
    p.x /= aspect;
    return pick(p + 0.5);
}`,
        css: (p, t) => ({
            transform: `translate(${(p.x * 100).toFixed(3)}%, ${(p.y * 100).toFixed(3)}%) rotate(${wrapDeg(p.rotate + (p.spin * t)).toFixed(2)}deg) scale(${Math.max(0.05, p.scale)})`
        })
    },
    {
        type: 'flip',
        label: 'Flip',
        group: 'transform',
        params: [choice('mode', 'Flip', [['h', 'Horizontal'], ['v', 'Vertical'], ['hv', 'Both']], 'h')],
        uniforms: (p) => ({ a: [p.mode === 'h' || p.mode === 'hv' ? 1 : 0, p.mode === 'v' || p.mode === 'hv' ? 1 : 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 p = vec2(u_a.x > 0.5 ? 1.0 - uv.x : uv.x, u_a.y > 0.5 ? 1.0 - uv.y : uv.y);
    return texture2D(u_input, p);
}`,
        css: (p) => ({ transform: p.mode === 'v' ? 'scale(1, -1)' : (p.mode === 'hv' ? 'scale(-1, -1)' : 'scale(-1, 1)') })
    },
    {
        type: 'mirror',
        label: 'Mirror',
        group: 'transform',
        params: [choice('mode', 'Keep', [['left', 'Left half'], ['right', 'Right half'], ['top', 'Top half'], ['bottom', 'Bottom half'], ['quad', 'Top-left quarter']], 'left')],
        uniforms: (p) => ({ a: [['left', 'right', 'top', 'bottom', 'quad'].indexOf(p.mode), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 p = uv;
    float m = u_a.x;
    if (m < 0.5) { p.x = p.x > 0.5 ? 1.0 - p.x : p.x; }
    else if (m < 1.5) { p.x = p.x < 0.5 ? 1.0 - p.x : p.x; }
    else if (m < 2.5) { p.y = p.y > 0.5 ? 1.0 - p.y : p.y; }
    else if (m < 3.5) { p.y = p.y < 0.5 ? 1.0 - p.y : p.y; }
    else { p.x = p.x > 0.5 ? 1.0 - p.x : p.x; p.y = p.y > 0.5 ? 1.0 - p.y : p.y; }
    return texture2D(u_input, p);
}`
    },
    {
        type: 'tile',
        label: 'Tile',
        group: 'transform',
        params: [num('x', 'Across', 1, 16, 1, 2), num('y', 'Down', 1, 16, 1, 2), choice('mirror', 'Mirror', [['no', 'No'], ['yes', 'Yes']], 'no')],
        uniforms: (p) => ({ a: [Math.max(1, Math.round(p.x)), Math.max(1, Math.round(p.y)), p.mirror === 'yes' ? 1 : 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 g = uv * u_a.xy;
    vec2 f = fract(g);
    if (u_a.z > 0.5) { f = mix(f, 1.0 - f, mod(floor(g), 2.0)); }
    return texture2D(u_input, f);
}`
    },
    {
        type: 'kaleido',
        label: 'Kaleidoscope',
        group: 'transform',
        params: [
            num('segments', 'Segments', 2, 24, 1, 6),
            num('rotate', 'Rotation', -180, 180, 0.1, 0, '°'),
            rateNum('spin', 'Spin', -360, 360, 1, 0, '°/s'),
            num('zoom', 'Zoom', 0.2, 4, 0.01, 1)
        ],
        animated: (p) => p.spin !== 0,
        uniforms: (p, t) => ({ a: [Math.max(2, Math.round(p.segments)), rad(wrapDeg(p.rotate + (p.spin * t))), Math.max(0.2, p.zoom), 0] }),
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p) / u_a.z;
    float a = atan(p.y, p.x) + u_a.y;
    float seg = 6.28318530718 / u_a.x;
    a = mod(a, seg);
    a = min(a, seg - a);
    vec2 q = vec2(cos(a), sin(a)) * r;
    q.x /= aspect;
    return texture2D(u_input, fold(q + 0.5));
}`
    },

    // --- distort -------------------------------------------------------
    {
        type: 'wave',
        label: 'Wave Warp',
        group: 'distort',
        params: [
            num('amount', 'Amount', 0, 0.2, 0.001, 0.02),
            num('waves', 'Waves', 0.5, 40, 0.5, 4),
            rateNum('speed', 'Speed', -10, 10, 0.05, 0.5, '/s'),
            choice('direction', 'Direction', [['h', 'Sideways'], ['v', 'Up and down']], 'h')
        ],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [p.amount, p.waves, frac(p.speed * t) * TAU, p.direction === 'v' ? 1 : 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 p = uv;
    if (u_a.w < 0.5) { p.x += sin((uv.y * u_a.y * 6.28318530718) + u_a.z) * u_a.x; }
    else { p.y += sin((uv.x * u_a.y * 6.28318530718) + u_a.z) * u_a.x; }
    return texture2D(u_input, fold(p));
}`
    },
    {
        type: 'pixelate',
        label: 'Pixelate',
        group: 'distort',
        params: [num('size', 'Size', 1, 240, 1, 24, 'px')],
        uniforms: (p) => ({ a: [Math.max(1, p.size), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 cells = u_size / u_a.x;
    return texture2D(u_input, (floor(uv * cells) + 0.5) / cells);
}`
    },
    {
        type: 'rgbSplit',
        label: 'Shift RGB',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 200, 1, 12, 'px'), num('angle', 'Angle', -180, 180, 1, 0, '°')],
        uniforms: (p) => ({ a: [Math.cos(rad(p.angle)) * p.amount, Math.sin(rad(p.angle)) * p.amount, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 d = u_a.xy / u_size;
    vec4 r = pick(uv + d);
    vec4 g = pick(uv);
    vec4 b = pick(uv - d);
    return vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}`
    },
    {
        type: 'blur',
        label: 'Blur',
        group: 'distort',
        params: [num('radius', 'Radius', 0, 80, 0.5, 8, 'px')],
        passes: 2,
        uniforms: (p) => ({ a: [Math.max(0, p.radius), 0, 0, 0] }),
        // Two passes, across then down, 25 taps each.
        glsl: `vec4 effect(vec2 uv) {
    vec2 dir = u_pass < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 step = dir * (u_a.x / 12.0) / u_size;
    vec4 sum = vec4(0.0);
    float total = 0.0;
    for (int i = -12; i <= 12; i++) {
        float x = float(i) / 12.0;
        float w = exp(-x * x * 2.5);
        sum += texture2D(u_input, uv + (step * float(i))) * w;
        total += w;
    }
    return sum / total;
}`,
        css: (p) => ({ filter: `blur(${Math.max(0, p.radius)}px)` })
    },

    // --- stylize -------------------------------------------------------
    {
        type: 'edges',
        label: 'Edge Detect',
        group: 'stylize',
        params: [num('amount', 'Amount', 0, 8, 0.01, 2), num('width', 'Width', 0.5, 8, 0.5, 1, 'px')],
        uniforms: (p) => ({ a: [p.amount, Math.max(0.5, p.width), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 d = u_a.y / u_size;
    float tl = luma(texture2D(u_input, uv + vec2(-d.x, -d.y)).rgb);
    float tc = luma(texture2D(u_input, uv + vec2(0.0, -d.y)).rgb);
    float tr = luma(texture2D(u_input, uv + vec2(d.x, -d.y)).rgb);
    float ml = luma(texture2D(u_input, uv + vec2(-d.x, 0.0)).rgb);
    float mr = luma(texture2D(u_input, uv + vec2(d.x, 0.0)).rgb);
    float bl = luma(texture2D(u_input, uv + vec2(-d.x, d.y)).rgb);
    float bc = luma(texture2D(u_input, uv + vec2(0.0, d.y)).rgb);
    float br = luma(texture2D(u_input, uv + vec2(d.x, d.y)).rgb);
    float gx = (tr + (2.0 * mr) + br) - (tl + (2.0 * ml) + bl);
    float gy = (bl + (2.0 * bc) + br) - (tl + (2.0 * tc) + tr);
    float e = clamp(length(vec2(gx, gy)) * u_a.x, 0.0, 1.0);
    return vec4(vec3(e), texture2D(u_input, uv).a);
}`
    },
    {
        type: 'vignette',
        label: 'Vignette',
        group: 'stylize',
        params: [num('amount', 'Amount', 0, 1, 0.01, 0.7), num('size', 'Size', 0, 1, 0.01, 0.5)],
        uniforms: (p) => ({ a: [p.amount, p.size, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float d = distance(uv, vec2(0.5)) * 1.41421356;
    float v = 1.0 - (smoothstep(u_a.y, u_a.y + 0.5, d) * u_a.x);
    return vec4(c.rgb * v, c.a);
}`
    },


    // --- more colour (2026-11-10, "add many effects: colour, wobbles, levels") ---
    {
        type: 'levels',
        label: 'Levels',
        group: 'colour',
        params: [
            num('inBlack', 'Input black', 0, 1, 0.01, 0.1),
            num('inWhite', 'Input white', 0, 1, 0.01, 0.85),
            num('gamma', 'Gamma', 0.1, 4, 0.01, 1),
            num('outBlack', 'Output black', 0, 1, 0.01, 0),
            num('outWhite', 'Output white', 0, 1, 0.01, 1)
        ],
        uniforms: (p) => ({ a: [p.inBlack, Math.max(p.inBlack + 0.001, p.inWhite), Math.max(0.1, p.gamma), 0], b: [p.outBlack, p.outWhite, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec3 x = clamp((c.rgb - u_a.x) / max(0.0001, u_a.y - u_a.x), 0.0, 1.0);
    x = pow(x, vec3(1.0 / u_a.z));
    return vec4(mix(vec3(u_b.x), vec3(u_b.y), x), c.a);
}`
    },
    {
        type: 'colourBalance',
        label: 'Colour Balance',
        group: 'colour',
        params: [num('red', 'Red', 0, 2, 0.01, 1.25), num('green', 'Green', 0, 2, 0.01, 1), num('blue', 'Blue', 0, 2, 0.01, 0.75)],
        uniforms: (p) => ({ a: [p.red, p.green, p.blue, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    return vec4(clamp(c.rgb * u_a.rgb, 0.0, 1.0), c.a);
}`
    },
    {
        type: 'duotone',
        label: 'Duotone',
        group: 'colour',
        params: [colour('dark', 'Dark', '#1a0040'), colour('light', 'Light', '#ffd000'), num('amount', 'Amount', 0, 1, 0.01, 1)],
        uniforms: (p) => ({ a: [...hexRgb(p.dark), p.amount], b: [...hexRgb(p.light), 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec3 tone = mix(u_a.rgb, u_b.rgb, luma(c.rgb));
    return vec4(mix(c.rgb, tone, u_a.a), c.a);
}`
    },
    {
        type: 'channelSwap',
        label: 'Channel Swap',
        group: 'colour',
        params: [choice('order', 'Order', [['brg', 'B R G'], ['gbr', 'G B R'], ['rbg', 'R B G'], ['grb', 'G R B'], ['bgr', 'B G R']], 'brg')],
        uniforms: (p) => ({ a: [['brg', 'gbr', 'rbg', 'grb', 'bgr'].indexOf(p.order), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float m = u_a.x;
    vec3 o = c.brg;
    if (m > 0.5 && m < 1.5) o = c.gbr;
    else if (m > 1.5 && m < 2.5) o = c.rbg;
    else if (m > 2.5 && m < 3.5) o = c.grb;
    else if (m > 3.5) o = c.bgr;
    return vec4(o, c.a);
}`
    },
    {
        type: 'solarize',
        label: 'Solarize',
        group: 'colour',
        params: [num('level', 'Level', 0, 1, 0.01, 0.5)],
        uniforms: (p) => ({ a: [p.level, 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    return vec4(mix(c.rgb, 1.0 - c.rgb, step(vec3(u_a.x), c.rgb)), c.a);
}`
    },

    // --- key: make part of the picture see-through ---------------------------
    {
        type: 'lumaKey',
        label: 'Luma Key',
        group: 'key',
        params: [
            num('level', 'Level', 0, 1, 0.01, 0.15),
            num('soft', 'Softness', 0, 0.5, 0.01, 0.05),
            choice('keep', 'Keep', [['light', 'Light'], ['dark', 'Dark']], 'light')
        ],
        uniforms: (p) => ({ a: [p.level, Math.max(0.0001, p.soft), p.keep === 'dark' ? 1 : 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float k = smoothstep(u_a.x - u_a.y, u_a.x + u_a.y, luma(c.rgb));
    if (u_a.z > 0.5) k = 1.0 - k;
    return vec4(c.rgb, c.a * k);
}`
    },
    {
        type: 'chromaKey',
        label: 'Chroma Key',
        group: 'key',
        params: [colour('key', 'Colour', '#00ff00'), num('tolerance', 'Tolerance', 0, 1, 0.01, 0.3), num('soft', 'Softness', 0, 0.5, 0.01, 0.1)],
        uniforms: (p) => ({ a: [...hexRgb(p.key), p.tolerance], b: [Math.max(0.0001, p.soft), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float d = distance(c.rgb, u_a.rgb);
    return vec4(c.rgb, c.a * smoothstep(u_a.a, u_a.a + u_b.x, d));
}`
    },

    // --- movement ---------------------------------------------------------------
    {
        type: 'scroll',
        label: 'Scroll',
        group: 'transform',
        params: [rateNum('x', 'Speed X', -2, 2, 0.01, 0.1, '/s'), rateNum('y', 'Speed Y', -2, 2, 0.01, 0, '/s')],
        animated: (p) => p.x !== 0 || p.y !== 0,
        uniforms: (p, t) => ({ a: [frac(p.x * t), frac(p.y * t), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    return texture2D(u_input, fract(uv - u_a.xy));
}`
    },
    {
        type: 'pulse',
        label: 'Pulse',
        group: 'transform',
        params: [num('amount', 'Amount', 0, 0.5, 0.01, 0.08), rateNum('speed', 'Speed', 0, 8, 0.05, 1, 'Hz')],
        animated: (p) => p.speed !== 0 && p.amount !== 0,
        uniforms: (p, t) => ({ a: [1 + (p.amount * Math.sin(frac(p.speed * t) * TAU)), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    return pick(((uv - 0.5) / u_a.x) + 0.5);
}`,
        css: (p, t) => ({ transform: `scale(${(1 + (p.amount * Math.sin(frac(p.speed * t) * TAU))).toFixed(4)})` })
    },

    // --- wobbles and distortions -------------------------------------------------
    {
        type: 'wobble',
        label: 'Wobble',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.1, 0.001, 0.015), num('scale', 'Size', 0.5, 20, 0.1, 4), rateNum('speed', 'Speed', 0, 5, 0.05, 1)],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [p.amount, p.scale, frac(p.speed * t) * TAU, frac(p.speed * t * 0.73) * TAU] }),
        glsl: `vec4 effect(vec2 uv) {
    float k = u_a.y * 6.28318530718;
    vec2 d = vec2(
        sin((uv.y * k) + u_a.z) + (0.5 * sin((uv.y * k * 2.3) - (u_a.w * 1.3))),
        cos((uv.x * k) + u_a.w) + (0.5 * cos((uv.x * k * 1.7) + (u_a.z * 1.1))));
    return texture2D(u_input, fold(uv + (d * u_a.x * 0.66)));
}`
    },
    {
        type: 'ripple',
        label: 'Ripple',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.1, 0.001, 0.015), num('rings', 'Rings', 1, 60, 0.5, 12), rateNum('speed', 'Speed', -5, 5, 0.05, 1, '/s')],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [p.amount, p.rings, frac(p.speed * t) * TAU, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float d = length(p);
    vec2 dir = d > 0.0001 ? p / d : vec2(0.0);
    vec2 q = p + (dir * sin((d * u_a.y * 6.28318530718) - u_a.z) * u_a.x);
    q.x /= aspect;
    return texture2D(u_input, fold(q + 0.5));
}`
    },
    {
        type: 'twirl',
        label: 'Twirl',
        group: 'distort',
        params: [num('angle', 'Angle', -720, 720, 1, 180, '°'), num('radius', 'Radius', 0.05, 1.5, 0.01, 0.5)],
        uniforms: (p) => ({ a: [rad(p.angle), Math.max(0.05, p.radius), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p);
    if (r < u_a.y) {
        float f = 1.0 - (r / u_a.y);
        float a = u_a.x * f * f;
        float c = cos(a);
        float s = sin(a);
        p = vec2((c * p.x) - (s * p.y), (s * p.x) + (c * p.y));
    }
    p.x /= aspect;
    return texture2D(u_input, p + 0.5);
}`
    },
    {
        type: 'bulge',
        label: 'Bulge / Pinch',
        group: 'distort',
        params: [num('amount', 'Amount', -0.9, 2, 0.01, 0.5), num('radius', 'Radius', 0.05, 1.5, 0.01, 0.6)],
        uniforms: (p) => ({ a: [p.amount, Math.max(0.05, p.radius), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float r = length(p) / u_a.y;
    if (r < 1.0 && r > 0.0001) p *= pow(r, u_a.x);
    p.x /= aspect;
    return texture2D(u_input, p + 0.5);
}`
    },
    {
        type: 'shake',
        label: 'Shake',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.2, 0.001, 0.02), rateNum('rate', 'Rate', 1, 30, 0.5, 12, 'Hz')],
        animated: () => true,
        uniforms: (p, t) => {
            const k = Math.floor(t * Math.max(1, p.rate))
            return { a: [(jsHash(k) - 0.5) * 2 * p.amount, (jsHash(k + 7.3) - 0.5) * 2 * p.amount, 0, 0] }
        },
        glsl: `vec4 effect(vec2 uv) {
    return texture2D(u_input, fold(uv - u_a.xy));
}`,
        css: (p, t) => {
            const k = Math.floor(t * Math.max(1, p.rate))
            return { transform: `translate(${((jsHash(k) - 0.5) * 200 * p.amount).toFixed(3)}%, ${((jsHash(k + 7.3) - 0.5) * 200 * p.amount).toFixed(3)}%)` }
        }
    },
    {
        type: 'glitch',
        label: 'Glitch',
        group: 'distort',
        params: [
            num('amount', 'Shift', 0, 0.3, 0.005, 0.06),
            num('bands', 'Bands', 2, 80, 1, 24),
            rateNum('rate', 'Rate', 1, 30, 0.5, 8, 'Hz'),
            num('split', 'Colour split', 0, 40, 0.5, 6, 'px')
        ],
        animated: () => true,
        uniforms: (p, t) => ({ a: [p.amount, Math.max(2, Math.round(p.bands)), Math.floor(t * Math.max(1, p.rate)) % 997, p.split] }),
        glsl: `vec4 effect(vec2 uv) {
    float band = floor(uv.y * u_a.y);
    float r = hash11(band + (u_a.z * 13.1));
    float shift = r > 0.7 ? (hash11((band * 3.1) + u_a.z) - 0.5) * 2.0 * u_a.x : 0.0;
    vec2 p = vec2(fract(uv.x + shift), uv.y);
    vec2 d = vec2(u_a.w / u_size.x, 0.0) * step(0.7, r);
    vec4 c = texture2D(u_input, p);
    return vec4(texture2D(u_input, fract(p + d)).r, c.g, texture2D(u_input, fract(p - d)).b, c.a);
}`
    },

    // --- more stylize --------------------------------------------------------------
    {
        type: 'halftone',
        label: 'Halftone',
        group: 'stylize',
        params: [num('size', 'Dot size', 2, 80, 0.5, 10, 'px'), num('angle', 'Angle', 0, 90, 1, 45, '°')],
        uniforms: (p) => ({ a: [Math.max(2, p.size), rad(p.angle), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    float c = cos(u_a.y);
    float s = sin(u_a.y);
    vec2 px = uv * u_size;
    vec2 q = vec2((c * px.x) + (s * px.y), (-s * px.x) + (c * px.y));
    vec2 cell = (floor(q / u_a.x) + 0.5) * u_a.x;
    vec2 back = vec2((c * cell.x) - (s * cell.y), (s * cell.x) + (c * cell.y));
    vec4 col = texture2D(u_input, back / u_size);
    float radius = sqrt(luma(col.rgb)) * u_a.x * 0.62;
    float m = 1.0 - smoothstep(radius - 0.75, radius + 0.75, length(q - cell));
    return vec4(col.rgb * m, col.a);
}`
    },
    {
        type: 'hexPixelate',
        label: 'Hex Pixelate',
        group: 'stylize',
        params: [num('size', 'Size', 4, 200, 1, 30, 'px')],
        uniforms: (p) => ({ a: [Math.max(4, p.size), 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 p = (uv * u_size) / u_a.x;
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - (hC.xy * s), p - ((hC.zw + 0.5) * s));
    vec2 centre = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? hC.xy * s : (hC.zw + 0.5) * s;
    return texture2D(u_input, (centre * u_a.x) / u_size);
}`
    },
    {
        type: 'scanlines',
        label: 'Scanlines',
        group: 'stylize',
        params: [num('lines', 'Lines', 20, 1200, 1, 300), num('darkness', 'Darkness', 0, 1, 0.01, 0.5), rateNum('speed', 'Speed', -20, 20, 0.1, 0, '/s')],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [p.lines, p.darkness, frac(p.speed * t), 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float wave = 0.5 + (0.5 * sin(((uv.y * u_a.x) + u_a.z) * 6.28318530718));
    return vec4(c.rgb * (1.0 - (u_a.y * wave)), c.a);
}`
    },
    {
        type: 'grain',
        label: 'Noise',
        group: 'stylize',
        params: [num('amount', 'Amount', 0, 1, 0.01, 0.25), choice('moving', 'Moving', [['yes', 'Yes'], ['no', 'No']], 'yes')],
        animated: (p) => p.moving === 'yes',
        uniforms: (p, t) => ({ a: [p.amount, p.moving === 'yes' ? Math.floor(t * 30) % 1000 : 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float n = hash12(floor(uv * u_size) + (u_a.y * 17.0)) - 0.5;
    return vec4(clamp(c.rgb + (n * u_a.x), 0.0, 1.0), c.a);
}`
    },
    {
        type: 'sharpen',
        label: 'Sharpen',
        group: 'stylize',
        params: [num('amount', 'Amount', 0, 4, 0.01, 1)],
        uniforms: (p) => ({ a: [p.amount, 0, 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 d = 1.0 / u_size;
    vec4 c = texture2D(u_input, uv);
    vec3 around = texture2D(u_input, uv + vec2(d.x, 0.0)).rgb + texture2D(u_input, uv - vec2(d.x, 0.0)).rgb
        + texture2D(u_input, uv + vec2(0.0, d.y)).rgb + texture2D(u_input, uv - vec2(0.0, d.y)).rgb;
    return vec4(clamp(c.rgb + ((c.rgb * 4.0) - around) * u_a.x, 0.0, 1.0), c.a);
}`
    },

    // --- time ----------------------------------------------------------
    {
        type: 'strobe',
        label: 'Strobe',
        group: 'time',
        params: [
            rateNum('rate', 'Rate', 0.25, 30, 0.25, 8, 'Hz'),
            num('duty', 'On time', 0.05, 0.95, 0.01, 0.5),
            choice('mode', 'Flash', [['white', 'White'], ['black', 'Black'], ['blink', 'Picture on / off']], 'white')
        ],
        animated: () => true,
        uniforms: (p, t) => ({ a: [frac(t * Math.max(0.25, p.rate)) < p.duty ? 1 : 0, ['white', 'black', 'blink'].indexOf(p.mode), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    if (u_a.x < 0.5) { return u_a.y > 1.5 ? vec4(0.0) : c; }
    if (u_a.y < 0.5) { return vec4(1.0); }
    if (u_a.y < 1.5) { return vec4(0.0, 0.0, 0.0, 1.0); }
    return c;
}`,
        css: (p, t) => {
            const on = frac(t * Math.max(0.25, p.rate)) < p.duty
            if (p.mode === 'blink') return { opacity: on ? 1 : 0 }
            return { flash: on ? (p.mode === 'black' ? '#000000' : '#ffffff') : null }
        }
    },
    // --- 2026-11-11: more effects (Emily: "i need moreeeee effects") ----------
    // Crisp ones on purpose — flat colour, hard lines, op-art and rave — and
    // still no trails or glow (see emily-raw-dot-motion). The beat-led ones
    // (Colour Strobe, Beat Wipe) count in the desk's beats (deskBeat.js).

    // colour
    {
        type: 'colourCycle',
        label: 'Colour Cycle',
        group: 'colour',
        params: [
            num('amount', 'Amount', 0, 1, 0.01, 1),
            num('bands', 'Rounds', 0.5, 8, 0.05, 1.5),
            num('shift', 'Shift', 0, 360, 1, 0, '°'),
            rateNum('speed', 'Speed', -2, 2, 0.01, 0.1, '/s')
        ],
        animated: (p) => p.speed !== 0,
        uniforms: (p, t) => ({ a: [p.amount, p.bands, frac((p.shift / 360) + (p.speed * t)), 0] }),
        // Brightness becomes a place on the colour wheel, and the wheel turns.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float h = fract((luma(c.rgb) * u_a.y) + u_a.z);
    vec3 wheel = clamp(abs(mod((h * 6.0) + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return vec4(mix(c.rgb, wheel, u_a.x), c.a);
}`
    },
    {
        type: 'heatMap',
        label: 'Heat Map',
        group: 'colour',
        params: [num('amount', 'Amount', 0, 1, 0.01, 1), num('contrast', 'Contrast', 0.25, 4, 0.01, 1.2)],
        uniforms: (p) => ({ a: [p.amount, p.contrast, 0, 0] }),
        // A thermal camera's colours, dark to light — no green in it.
        glsl: `vec3 heat(float t) {
    float s = clamp(t, 0.0, 1.0) * 6.0;
    if (s < 1.0) return mix(vec3(0.0), vec3(0.06, 0.0, 0.45), s);
    if (s < 2.0) return mix(vec3(0.06, 0.0, 0.45), vec3(0.55, 0.0, 0.72), s - 1.0);
    if (s < 3.0) return mix(vec3(0.55, 0.0, 0.72), vec3(0.95, 0.08, 0.35), s - 2.0);
    if (s < 4.0) return mix(vec3(0.95, 0.08, 0.35), vec3(1.0, 0.55, 0.0), s - 3.0);
    if (s < 5.0) return mix(vec3(1.0, 0.55, 0.0), vec3(1.0, 0.95, 0.3), s - 4.0);
    return mix(vec3(1.0, 0.95, 0.3), vec3(1.0), s - 5.0);
}
vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float l = ((luma(c.rgb) - 0.5) * u_a.y) + 0.5;
    return vec4(mix(c.rgb, heat(l), u_a.x), c.a);
}`
    },
    {
        type: 'popColours',
        label: 'Pop Colours',
        group: 'colour',
        params: [
            choice('palette', 'Colours', [['warhol', 'Warhol'], ['neon', 'Neon'], ['riso', 'Riso'], ['acid', 'Acid']], 'warhol'),
            num('shift', 'Swap', 0, 3, 1, 0),
            num('amount', 'Amount', 0, 1, 0.01, 1)
        ],
        uniforms: (p) => ({ a: [['warhol', 'neon', 'riso', 'acid'].indexOf(p.palette), Math.floor(p.shift + 0.5), p.amount, 0] }),
        // Four flat colours by brightness, a screen print's; Swap deals them
        // round (an LFO on it steps through the four).
        glsl: `vec3 inkOf(float palette, float i) {
    if (palette < 0.5) {
        if (i < 0.5) return vec3(0.07, 0.0, 0.14);
        if (i < 1.5) return vec3(1.0, 0.16, 0.54);
        if (i < 2.5) return vec3(1.0, 0.83, 0.0);
        return vec3(0.16, 0.77, 1.0);
    }
    if (palette < 1.5) {
        if (i < 0.5) return vec3(0.0);
        if (i < 1.5) return vec3(0.12, 0.24, 1.0);
        if (i < 2.5) return vec3(1.0, 0.12, 0.7);
        return vec3(1.0);
    }
    if (palette < 2.5) {
        if (i < 0.5) return vec3(0.1, 0.12, 0.36);
        if (i < 1.5) return vec3(1.0, 0.23, 0.18);
        if (i < 2.5) return vec3(1.0, 0.61, 0.76);
        return vec3(1.0, 0.96, 0.86);
    }
    if (i < 0.5) return vec3(0.0);
    if (i < 1.5) return vec3(0.54, 0.0, 1.0);
    if (i < 2.5) return vec3(1.0, 0.42, 0.0);
    return vec3(1.0, 0.95, 0.0);
}
vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float band = floor(clamp(luma(c.rgb), 0.0, 0.999) * 4.0);
    float i = mod(band + u_a.y, 4.0);
    return vec4(mix(c.rgb, inkOf(u_a.x, i), u_a.z), c.a);
}`
    },
    {
        type: 'exposure',
        label: 'Exposure / Gamma',
        group: 'colour',
        params: [num('stops', 'Exposure', -3, 3, 0.01, 0.5, 'st'), num('gamma', 'Gamma', 0.2, 3, 0.01, 1)],
        uniforms: (p) => ({ a: [Math.pow(2, p.stops), 1 / Math.max(0.2, p.gamma), 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    return vec4(pow(clamp(c.rgb * u_a.x, 0.0, 1.0), vec3(u_a.y)), c.a);
}`,
        css: (p) => ({ filter: `brightness(${Math.pow(2, p.stops).toFixed(4)})` })
    },

    // transform
    {
        type: 'turn3d',
        label: '3D Turn',
        group: 'transform',
        params: [
            num('x', 'Tilt', -80, 80, 0.1, 25, '°'),
            num('y', 'Turn', -80, 80, 0.1, 0, '°'),
            num('distance', 'Depth', 0.6, 6, 0.01, 1.6),
            num('zoom', 'Zoom', 0.2, 3, 0.01, 1)
        ],
        uniforms: (p) => ({ a: [rad(p.x), rad(p.y), Math.max(0.6, p.distance), Math.max(0.2, p.zoom)] }),
        // The picture as a card turned in space, seen through a lens
        // u_a.z away: each pixel's ray is cut with the turned card.
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
    float cx = cos(u_a.x);
    float sx = sin(u_a.x);
    float cy = cos(u_a.y);
    float sy = sin(u_a.y);
    vec3 ax = vec3(cy, 0.0, -sy);
    vec3 ay = vec3(sx * sy, cx, sx * cy);
    vec3 n = vec3(cx * sy, -sx, cx * cy);
    vec3 o = vec3(0.0, 0.0, -u_a.z);
    vec3 d = normalize(vec3(q, u_a.z));
    float facing = dot(d, n);
    if (abs(facing) < 0.0001) return vec4(0.0);
    float t = -dot(o, n) / facing;
    if (t < 0.0) return vec4(0.0);
    vec3 hit = o + (d * t);
    vec2 local = vec2(dot(hit, ax), dot(hit, ay)) / u_a.w;
    return pick((local / vec2(aspect, 1.0)) + 0.5);
}`
    },
    {
        type: 'polar',
        label: 'Polar',
        group: 'transform',
        params: [
            choice('mode', 'Way', [['round', 'Wrap round'], ['flat', 'Unwrap']], 'round'),
            num('turn', 'Turn', 0, 360, 1, 0, '°'),
            num('repeat', 'Repeat', 1, 8, 1, 1)
        ],
        uniforms: (p) => ({ a: [p.mode === 'flat' ? 1 : 0, p.turn / 360, Math.max(1, Math.round(p.repeat)), 0] }),
        // Wrap round: the picture's bottom edge goes to the middle and its
        // sides meet; Unwrap is the other way.
        glsl: `vec4 effect(vec2 uv) {
    float aspect = u_size.x / u_size.y;
    if (u_a.x < 0.5) {
        vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
        float r = length(p) * 2.0;
        float a = (atan(p.y, p.x) / 6.28318530718) + 0.5;
        vec2 src = vec2(fract((a * u_a.z) + u_a.y), 1.0 - r);
        return src.y < 0.0 ? vec4(0.0) : texture2D(u_input, src);
    }
    float a = ((fract(uv.x - u_a.y) * u_a.z) - 0.5) * 6.28318530718;
    float r = (1.0 - uv.y) * 0.5;
    vec2 p = vec2(cos(a), sin(a)) * r;
    return pick((p / vec2(aspect, 1.0)) + 0.5);
}`
    },
    {
        type: 'sliceShift',
        label: 'Slice Shift',
        group: 'transform',
        params: [
            num('slices', 'Slices', 2, 120, 1, 14),
            num('shift', 'Shift', -0.5, 0.5, 0.001, 0.06),
            choice('direction', 'Lie', [['h', 'Lying'], ['v', 'Standing']], 'h')
        ],
        uniforms: (p) => ({ a: [Math.max(2, Math.round(p.slices)), p.shift, p.direction === 'v' ? 1 : 0, 0] }),
        // Every other slice slides one way, the rest the other.
        glsl: `vec4 effect(vec2 uv) {
    float across = u_a.z < 0.5 ? uv.y : uv.x;
    float side = mod(floor(across * u_a.x), 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 p = uv;
    if (u_a.z < 0.5) { p.x = fract(uv.x + (side * u_a.y)); }
    else { p.y = fract(uv.y + (side * u_a.y)); }
    return texture2D(u_input, p);
}`
    },

    // distort
    {
        type: 'displace',
        label: 'Displace',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.3, 0.001, 0.04), num('angle', 'Angle', -180, 180, 1, 0, '°')],
        uniforms: (p) => ({ a: [p.amount, Math.cos(rad(p.angle)), Math.sin(rad(p.angle)), 0] }),
        // Each pixel moves by its own brightness: light one way, dark the other.
        glsl: `vec4 effect(vec2 uv) {
    float l = luma(texture2D(u_input, uv).rgb) - 0.5;
    vec2 d = vec2(u_a.y, u_a.z * u_size.x / u_size.y) * l * 2.0 * u_a.x;
    return texture2D(u_input, fold(uv + d));
}`
    },
    {
        type: 'liquid',
        label: 'Liquid',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.12, 0.001, 0.025), num('size', 'Size', 0.5, 20, 0.1, 3), rateNum('speed', 'Speed', 0, 4, 0.01, 0.4)],
        animated: (p) => p.speed !== 0,
        // The noise travels round a circle, so it loops without a seam.
        uniforms: (p, t) => {
            const a = frac((p.speed * t) / 8) * TAU
            return { a: [p.amount, p.size, Math.cos(a) * 2.5, Math.sin(a) * 2.5] }
        },
        glsl: `float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - (2.0 * f));
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec4 effect(vec2 uv) {
    vec2 q = uv * vec2(u_size.x / u_size.y, 1.0) * u_a.y;
    vec2 d = vec2(
        vnoise(q + u_a.zw + vec2(3.1, 7.7)) + (0.5 * vnoise((q * 2.1) - u_a.wz)),
        vnoise(q - u_a.wz + vec2(11.3, 1.9)) + (0.5 * vnoise((q * 2.3) + u_a.zw))) - 0.75;
    return texture2D(u_input, fold(uv + (d * u_a.x * 1.3)));
}`
    },
    {
        type: 'shuffle',
        label: 'Block Shuffle',
        group: 'distort',
        params: [
            num('blocks', 'Blocks', 2, 40, 1, 8),
            num('amount', 'Moved', 0, 1, 0.01, 0.35),
            rateNum('rate', 'Rate', 0.25, 30, 0.25, 4, 'Hz')
        ],
        animated: () => true,
        uniforms: (p, t) => ({ a: [Math.max(2, Math.round(p.blocks)), p.amount, Math.floor(t * Math.max(0.25, p.rate)) % 997, 0] }),
        // Square blocks; some show another block's piece, dealt again each step.
        glsl: `vec4 effect(vec2 uv) {
    vec2 grid = vec2(u_a.x, max(1.0, floor((u_a.x * u_size.y / u_size.x) + 0.5)));
    vec2 cell = floor(uv * grid);
    float seed = u_a.z * 1.37;
    if (hash12(cell + seed) >= u_a.y) return texture2D(u_input, uv);
    vec2 other = floor(vec2(hash12(cell + seed + 3.1), hash12(cell + seed + 7.7)) * grid);
    return texture2D(u_input, (other + fract(uv * grid)) / grid);
}`
    },
    {
        type: 'stretch',
        label: 'Pixel Stretch',
        group: 'distort',
        params: [
            num('at', 'From', 0, 1, 0.001, 0.6),
            choice('way', 'Towards', [['right', 'Right'], ['left', 'Left'], ['down', 'Down'], ['up', 'Up']], 'right')
        ],
        uniforms: (p) => ({ a: [p.at, ['right', 'left', 'down', 'up'].indexOf(p.way), 0, 0] }),
        // Past the line, one row (or column) of pixels is pulled out flat.
        glsl: `vec4 effect(vec2 uv) {
    vec2 p = uv;
    if (u_a.y < 0.5) { p.x = min(uv.x, u_a.x); }
    else if (u_a.y < 1.5) { p.x = max(uv.x, 1.0 - u_a.x); }
    else if (u_a.y < 2.5) { p.y = min(uv.y, u_a.x); }
    else { p.y = max(uv.y, 1.0 - u_a.x); }
    return texture2D(u_input, p);
}`
    },
    {
        type: 'zoomBlur',
        label: 'Zoom Blur',
        group: 'distort',
        params: [num('amount', 'Amount', 0, 0.6, 0.001, 0.12), num('x', 'Middle X', -0.5, 0.5, 0.001, 0), num('y', 'Middle Y', -0.5, 0.5, 0.001, 0)],
        uniforms: (p) => ({ a: [p.amount, 0.5 + p.x, 0.5 + p.y, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 middle = u_a.yz;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 24; i++) {
        float k = float(i) / 23.0;
        sum += texture2D(u_input, mix(uv, middle, k * u_a.x));
    }
    return sum / 24.0;
}`
    },

    // stylize
    {
        type: 'ledScreen',
        label: 'LED Screen',
        group: 'stylize',
        params: [
            num('size', 'LED size', 4, 120, 0.5, 16, 'px'),
            num('gap', 'Gap', 0, 0.8, 0.01, 0.3),
            choice('shape', 'Shape', [['round', 'Round'], ['square', 'Square']], 'round')
        ],
        uniforms: (p) => ({ a: [Math.max(4, p.size), p.gap, p.shape === 'square' ? 1 : 0, 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec2 g = (uv * u_size) / u_a.x;
    vec2 cell = floor(g);
    vec4 c = texture2D(u_input, ((cell + 0.5) * u_a.x) / u_size);
    vec2 local = fract(g) - 0.5;
    float d = u_a.z > 0.5 ? max(abs(local.x), abs(local.y)) : length(local);
    float r = 0.5 * (1.0 - u_a.y);
    float aa = 1.2 / u_a.x;
    float lit = 1.0 - smoothstep(r - aa, r, d);
    return vec4(c.rgb * lit, c.a);
}`
    },
    {
        type: 'lineScreen',
        label: 'Line Screen',
        group: 'stylize',
        params: [
            num('lines', 'Lines', 8, 400, 1, 70),
            num('angle', 'Angle', -90, 90, 0.5, 0, '°'),
            choice('ink', 'Ink', [['white', 'White'], ['colour', 'Its colour']], 'white')
        ],
        uniforms: (p) => ({ a: [Math.max(8, p.lines), Math.cos(rad(p.angle)), Math.sin(rad(p.angle)), p.ink === 'colour' ? 1 : 0] }),
        // Parallel lines as thick as the picture is bright — an op-art print.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float period = u_size.y / u_a.x;
    vec2 px = uv * u_size;
    float s = dot(px, vec2(-u_a.z, u_a.y)) / period;
    float f = abs(fract(s) - 0.5) * 2.0;
    float l = clamp(luma(c.rgb), 0.0, 1.0);
    float aa = 2.0 / period;
    float on = 1.0 - smoothstep(l - aa, l + aa, f);
    vec3 ink = u_a.w > 0.5 ? c.rgb : vec3(1.0);
    return vec4(ink * on, c.a);
}`
    },
    {
        type: 'contours',
        label: 'Contours',
        group: 'stylize',
        params: [
            num('lines', 'Lines', 2, 40, 1, 10),
            num('width', 'Width', 0.5, 8, 0.5, 1.5, 'px'),
            choice('mode', 'Draw', [['lines', 'Lines'], ['over', 'Over the picture'], ['bands', 'Bands']], 'lines')
        ],
        uniforms: (p) => ({ a: [Math.max(2, Math.round(p.lines)), Math.max(0.5, p.width), ['lines', 'over', 'bands'].indexOf(p.mode), 0] }),
        // Lines of equal brightness, as on a map; Bands fills between them
        // in turn, black and white.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float l = luma(c.rgb) * u_a.x;
    if (u_a.z > 1.5) {
        float band = mod(floor(l), 2.0);
        return vec4(vec3(band), c.a);
    }
    vec2 d = 1.0 / u_size;
    float gx = (luma(texture2D(u_input, uv + vec2(d.x, 0.0)).rgb) - luma(texture2D(u_input, uv - vec2(d.x, 0.0)).rgb)) * 0.5;
    float gy = (luma(texture2D(u_input, uv + vec2(0.0, d.y)).rgb) - luma(texture2D(u_input, uv - vec2(0.0, d.y)).rgb)) * 0.5;
    float slope = max(0.0001, length(vec2(gx, gy)) * u_a.x);
    float f = fract(l);
    float away = min(f, 1.0 - f) / slope;
    float on = 1.0 - smoothstep(u_a.y * 0.5, (u_a.y * 0.5) + 1.0, away);
    // Only the levels between black and white: a flat black or white area
    // sits ON level 0 or the last one and would come out solid.
    float nearest = floor(l + 0.5);
    if (nearest < 0.5 || nearest > u_a.x - 0.5) on = 0.0;
    if (u_a.z > 0.5) return vec4(mix(c.rgb, vec3(1.0), on), c.a);
    return vec4(vec3(on), c.a);
}`
    },
    {
        type: 'dither',
        label: 'Dither',
        group: 'stylize',
        params: [
            num('size', 'Pixel', 1, 16, 1, 3, 'px'),
            num('levels', 'Levels', 2, 8, 1, 2),
            choice('ink', 'Colour', [['mono', 'Black & white'], ['colour', 'Colour']], 'mono')
        ],
        uniforms: (p) => ({ a: [Math.max(1, Math.round(p.size)), Math.max(2, Math.round(p.levels)), p.ink === 'colour' ? 1 : 0, 0] }),
        // An ordered 4 × 4 dither, a screen from an old printer.
        glsl: `float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return (bayer2(0.5 * a) * 0.25) + bayer2(a); }
vec4 effect(vec2 uv) {
    vec2 cell = floor((uv * u_size) / u_a.x);
    vec4 c = texture2D(u_input, ((cell + 0.5) * u_a.x) / u_size);
    float steps = u_a.y - 1.0;
    float t = bayer4(cell);
    vec3 v = u_a.z > 0.5 ? c.rgb : vec3(luma(c.rgb));
    vec3 q = floor((v * steps) + t) / steps;
    return vec4(clamp(q, 0.0, 1.0), c.a);
}`
    },
    {
        type: 'emboss',
        label: 'Emboss',
        group: 'stylize',
        params: [
            num('amount', 'Amount', 0, 6, 0.01, 2),
            num('angle', 'Light from', -180, 180, 1, 135, '°'),
            choice('mode', 'Look', [['grey', 'Grey'], ['colour', 'Colour']], 'grey')
        ],
        uniforms: (p) => ({ a: [p.amount, Math.cos(rad(p.angle)), Math.sin(rad(p.angle)), p.mode === 'colour' ? 1 : 0] }),
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec2 d = (vec2(u_a.y, -u_a.z) * 1.5) / u_size;
    float e = luma(texture2D(u_input, uv - d).rgb) - luma(texture2D(u_input, uv + d).rgb);
    vec3 rgb = u_a.w > 0.5 ? c.rgb + vec3(e * u_a.x) : vec3(0.5 + (e * u_a.x));
    return vec4(clamp(rgb, 0.0, 1.0), c.a);
}`
    },
    {
        type: 'checkerFlip',
        label: 'Checker Flip',
        group: 'stylize',
        params: [
            num('squares', 'Squares', 2, 64, 1, 8),
            num('slide', 'Slide', 0, 1, 0.001, 0),
            num('amount', 'Amount', 0, 1, 0.01, 1)
        ],
        uniforms: (p) => ({ a: [Math.max(2, Math.round(p.squares)), p.slide, p.amount, 0] }),
        // Every other square of a checkerboard turned negative; Slide moves
        // the board one square along (an LFO on it makes it march).
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec2 g = ((uv * u_size) / (u_size.y / u_a.x)) + vec2(u_a.y * 2.0, 0.0);
    float odd = mod(floor(g.x) + floor(g.y), 2.0);
    return vec4(mix(c.rgb, 1.0 - c.rgb, odd * u_a.z), c.a);
}`
    },

    // key
    {
        type: 'shapeMask',
        label: 'Shape Mask',
        group: 'key',
        params: [
            choice('shape', 'Shape', [['circle', 'Circle'], ['box', 'Square'], ['diamond', 'Diamond']], 'circle'),
            num('size', 'Size', 0, 2, 0.001, 0.6),
            num('soft', 'Softness', 0, 0.5, 0.001, 0.01),
            num('x', 'Middle X', -0.5, 0.5, 0.001, 0),
            num('y', 'Middle Y', -0.5, 0.5, 0.001, 0),
            choice('keep', 'Keep', [['inside', 'Inside'], ['outside', 'Outside']], 'inside')
        ],
        uniforms: (p) => ({
            a: [['circle', 'box', 'diamond'].indexOf(p.shape), p.size * 0.5, Math.max(0.0005, p.soft * 0.5), p.keep === 'outside' ? 1 : 0],
            b: [p.x, p.y, 0, 0]
        }),
        // Only a shape of the picture shows; the rest is see-through.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    vec2 p = (uv - 0.5 - u_b.xy) * vec2(u_size.x / u_size.y, 1.0);
    float d = u_a.x < 0.5 ? length(p) : (u_a.x < 1.5 ? max(abs(p.x), abs(p.y)) : (abs(p.x) + abs(p.y)) * 0.7071);
    float inside = 1.0 - smoothstep(u_a.y - u_a.z, u_a.y + u_a.z, d);
    float keep = u_a.w > 0.5 ? 1.0 - inside : inside;
    return vec4(c.rgb, c.a * keep);
}`
    },

    // time — on the beat
    {
        type: 'colourStrobe',
        label: 'Colour Strobe',
        group: 'time',
        params: [
            choice('every', 'Every', [['0.25', '¼ beat'], ['0.5', '½ beat'], ['1', 'Beat'], ['2', '2 beats'], ['4', 'Bar']], '1'),
            num('duty', 'On time', 0.05, 0.95, 0.01, 0.35),
            choice('colours', 'Colours', [['neon', 'Neon'], ['warhol', 'Warhol'], ['rgb', 'R G B'], ['white', 'White']], 'neon'),
            choice('mode', 'Flash', [['flash', 'Whole frame'], ['tint', 'Tint the picture']], 'flash')
        ],
        animated: () => true,
        uniforms: (p, t, beat = 0) => {
            const look = strobeColourAt(p, beat)
            return { a: [...look.rgb, look.on ? 1 : 0], b: [p.mode === 'tint' ? 1 : 0, 0, 0, 0] }
        },
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    if (u_a.w < 0.5) return c;
    if (u_b.x > 0.5) return vec4(c.rgb * u_a.rgb, c.a);
    return vec4(u_a.rgb, 1.0);
}`,
        css: (p, t, beat = 0) => {
            const look = strobeColourAt(p, beat)
            if (p.mode === 'tint' || !look.on) return { flash: null }
            return { flash: look.hex }
        }
    },
    {
        type: 'beatWipe',
        label: 'Beat Wipe',
        group: 'time',
        params: [
            choice('every', 'Every', [['1', 'Beat'], ['2', '2 beats'], ['4', 'Bar'], ['8', '2 bars']], '4'),
            choice('way', 'Way', [['right', 'Left to right'], ['down', 'Top down'], ['out', 'From the middle'], ['across', 'Corner to corner']], 'right'),
            num('soft', 'Edge', 0, 0.3, 0.001, 0.01),
            choice('ink', 'Behind', [['black', 'Black'], ['clear', 'See-through']], 'black')
        ],
        animated: () => true,
        uniforms: (p, t, beat = 0) => {
            const every = Number(p.every) || 4
            const progress = frac(beat / every)
            return { a: [progress, ['right', 'down', 'out', 'across'].indexOf(p.way), Math.max(0.0005, p.soft), p.ink === 'clear' ? 1 : 0] }
        },
        // Each round the picture is wiped in again from nothing.
        glsl: `vec4 effect(vec2 uv) {
    vec4 c = texture2D(u_input, uv);
    float at = uv.x;
    if (u_a.y > 0.5 && u_a.y < 1.5) at = uv.y;
    else if (u_a.y > 1.5 && u_a.y < 2.5) at = length((uv - 0.5) * vec2(u_size.x / u_size.y, 1.0)) / length(vec2(u_size.x / u_size.y, 1.0) * 0.5);
    else if (u_a.y > 2.5) at = (uv.x + uv.y) * 0.5;
    float shown = 1.0 - smoothstep(u_a.x - u_a.z, u_a.x + u_a.z, at);
    if (u_a.w > 0.5) return vec4(c.rgb, c.a * shown);
    return vec4(c.rgb * shown, c.a);
}`
    }
]

const BY_TYPE = new Map(EFFECTS.map((def) => [def.type, def]))

export const effectCatalogue = () => EFFECTS
export const effectDef = (type) => BY_TYPE.get(type) || null
export const hasCssForm = (type) => Boolean(BY_TYPE.get(type)?.css)

// A visual whose pixels the mesh can read gets every effect; the rest only
// the CSS ones. Same rule as MapStage's `meshable`, by kind.
const GL_KINDS = new Set(['video', 'image', 'camera', 'test', 'colour', 'html'])
export const visualTakesShaders = (visual) => GL_KINDS.has(visual?.source?.kind)

// A param value read through its spec: a stored value that is missing, of the
// wrong type or out of range comes back as something the effect can use.
const readParam = (spec, raw) => {
    if (spec.kind === 'number') {
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : spec.default
        return Math.min(spec.max, Math.max(spec.min, value))
    }
    if (spec.kind === 'choice') return spec.options.some(([id]) => id === raw) ? raw : spec.default
    if (spec.kind === 'colour') return typeof raw === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(raw) ? raw : spec.default
    return spec.default
}

// With a `beat`, the settings that have an LFO on are where it has swung them
// to at that beat (paramLfo.js); without one, where their sliders are.
export const effectParams = (effect, beat) => {
    const def = effectDef(effect?.type)
    if (!def) return {}
    const out = {}
    def.params.forEach((spec) => { out[spec.key] = readParam(spec, effect?.params?.[spec.key]) })
    return beat === undefined ? out : valuesAt(def.params, out, effect?.lfo, beat)
}

export const newEffect = (type) => {
    const def = effectDef(type)
    if (!def) return null
    const params = {}
    def.params.forEach((spec) => { params[spec.key] = spec.default })
    return { id: generateId('fx'), type, on: true, params }
}

// The effects that actually run, in order: the clip's own, then (for the
// wall) the composition's. Bypassed and unknown ones drop out here.
export const effectChain = (clipEffects = [], compEffects = []) => [
    ...(Array.isArray(clipEffects) ? clipEffects : []),
    ...(Array.isArray(compEffects) ? compEffects : [])
].filter((effect) => effect && effect.on !== false && BY_TYPE.has(effect.type))

export const chainIsAnimated = (chain) => chain.some((effect) => {
    const def = BY_TYPE.get(effect.type)
    return Boolean(def?.animated?.(effectParams(effect))) || anyLfoMoving(effect.lfo)
})

// What the shader pass needs right now: per effect its program id, its two
// param vectors and how many passes it takes.
export const glPasses = (chain, t = effectClock(), beat = deskBeat()) => chain.map((effect) => {
    const def = BY_TYPE.get(effect.type)
    const values = def.uniforms(effectParams(effect, beat), t, beat)
    return { type: def.type, a: values.a || [0, 0, 0, 0], b: values.b || [0, 0, 0, 0], passes: def.passes || 1 }
})

export const glslFor = (type) => BY_TYPE.get(type)?.glsl || null

// What the CSS path draws right now: one filter string, one transform, an
// opacity, and the overlays (a colour wash, a flash).
export const cssLook = (chain, t = effectClock(), beat = deskBeat()) => {
    const filters = []
    const transforms = []
    let opacity = 1
    let overlay = null
    let flash = null
    chain.forEach((effect) => {
        const def = BY_TYPE.get(effect.type)
        if (!def?.css) return
        const look = def.css(effectParams(effect, beat), t, beat)
        if (look.filter) filters.push(look.filter)
        if (look.transform) transforms.push(look.transform)
        if (typeof look.opacity === 'number') opacity *= look.opacity
        if (look.overlay) overlay = look.overlay
        if (look.flash !== undefined) flash = look.flash
    })
    return {
        filter: filters.length ? filters.join(' ') : 'none',
        transform: transforms.length ? transforms.join(' ') : 'none',
        opacity,
        overlay,
        flash
    }
}

// Stable text of a chain, for "did anything change" checks.
export const chainSignature = (chain) => chain.map((effect) => `${effect.type}:${JSON.stringify(effectParams(effect))}${effect.lfo ? `~${JSON.stringify(effect.lfo)}` : ''}`).join('|')
