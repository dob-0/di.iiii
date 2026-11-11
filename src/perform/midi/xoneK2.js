// The Allen & Heath Xone:K2 default map for the VJ deck. Every number comes
// from the control sheet beside this file (xone-k2-default.json, the K2 user
// guide's 58 controls; copied from the underground/midi sheet) — looked up by
// control NAME, never typed here.
//
// Layout (layer / column are 1-based on the device, 0-based in the entries):
//   faders 1-4            opacity of layers 1-4
//   matrix 4x4            clips: row = layer 1-4 (top row = layer 1), column 1-4
//   pot row 1 (4 pots)    blend mode of layers 1-4
//   pot row 2             speed of the playing clip of layers 1-4
//   pot row 3             FIRST EFFECT of the selected layer (master when MASTER is picked): mix, then its first three params
//   pot switches row 1    bypass layers 1-4      (red while bypassed)
//   pot switches row 2    solo layers 1-4        (green while solo)
//   pot switches row 3    effect 1-4 of the selected layer on / off (green on, red off); side A/B is not mapped (Learn can)
//   top encoders 1-4 push play column 1-4
//   top encoder 1 turn    tempo nudge; encoders 2-4 turn FREE
//   bottom encoder 5      turn = crossfade nudge, push = tap tempo
//   bottom encoder 6      turn = master nudge, push = next effect (which one pots 9-12 turn)
//   LAYER                 next layer for effects (skips empty layers)
//   EXIT SETUP            FREEZE while held (hold 1 on the Freeze effects of master + selected layer)

import sheet from './xone-k2-default.json'

export const K2_NAME = 'XONE:K2'
export const K2_CHANNEL = 15

const byName = new Map(sheet.map((control) => [control.control, control]))
const control = (name) => {
    const found = byName.get(name)
    if (!found) throw new Error(`xone-k2-default.json has no control "${name}"`)
    return found
}
const matchOf = (name) => {
    const { kind, number, channel } = control(name)
    return { kind, number, channel }
}
const bind = (name, action, args = {}, extra = {}) => ({ control: name, match: matchOf(name), action, args, ...extra })
const range = (count) => Array.from({ length: count }, (_, index) => index)

const MATRIX_NAMES = 'ABCDEFGHIJKLMNOP'.split('').map((letter) => `matrix ${letter}`)

export const XONE_K2_MAP = [
    ...range(4).map((i) => bind(`fader ${i + 1}`, 'opacity', { layer: i })),
    ...MATRIX_NAMES.map((name, i) => bind(name, 'clip', { layer: Math.floor(i / 4), column: i % 4 })),
    ...range(4).map((i) => bind(`pot ${i + 1}`, 'blend', { layer: i })),
    ...range(4).map((i) => bind(`pot ${i + 5}`, 'clipSpeed', { layer: i })),
    ...range(4).map((i) => bind(`pot switch ${i + 1}`, 'bypass', { layer: i })),
    ...range(4).map((i) => bind(`pot switch ${i + 5}`, 'solo', { layer: i })),
    ...range(4).map((i) => bind(`pot switch ${i + 9}`, 'fxToggle', { slot: i })),
    ...range(4).map((i) => bind(`encoder ${i + 1} push`, 'column', { column: i })),
    bind('pot 9', 'fx', { param: 'mix' }),
    ...range(3).map((i) => bind(`pot ${i + 10}`, 'fx', { param: i })),
    bind('encoder 1', 'bpm', {}, { relative: true }),
    // the deck has six layers and the K2 four strips: the two layers without a fader get a top knob (N3635)
    bind('encoder 2', 'opacity', { layer: 4 }, { relative: true }),
    bind('encoder 3', 'opacity', { layer: 5 }, { relative: true }),
    bind('encoder 4', 'fx', { param: 'mix', layer: -1 }, { relative: true }),
    bind('encoder 5', 'crossfade', {}, { relative: true }),
    bind('encoder 5 push', 'tap'),
    bind('layer button', 'fxLayerNext'),
    bind('encoder 6 push', 'fxNext'),
    bind('exit setup button', 'hold'),
    bind('encoder 6', 'master', {}, { relative: true })
]

/** Sheet controls the default map leaves unbound (free for Learn). */
export const XONE_K2_FREE = sheet
    .map((item) => item.control)
    .filter((name) => !XONE_K2_MAP.some((entry) => entry.control === name))

/** note number → { red, amber, green } LED notes, from the sheet's led_notes. */
export const XONE_K2_LEDS = Object.fromEntries(
    sheet.filter((item) => item.kind === 'note' && item.led_notes).map((item) => [item.number, item.led_notes])
)

/** Is this control an encoder (relative) on the K2? For Learn. */
export const k2IsRelative = (match) => sheet.some((item) => item.kind === match.kind && item.number === match.number && item.mode === 'relative')

export const XONE_K2_CONTROLS = sheet

/** The map with the display name dropped, as applyMidi takes it. */
export const defaultMap = () => XONE_K2_MAP.map(({ match, action, args, relative }) => ({ match, action, args, ...(relative ? { relative: true } : {}) }))

/** The input to listen on: the K2 by name, else the first one, else ''. */
export const pickInputId = (devices = []) => {
    const k2 = devices.find((device) => String(device.name || '').toUpperCase().includes(K2_NAME))
    return (k2 || devices[0])?.id || ''
}
export const isK2 = (device) => String(device?.name || '').toUpperCase().includes(K2_NAME)
