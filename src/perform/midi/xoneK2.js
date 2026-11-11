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
//
// Second console `K2 (1.9)` (id k2-1.9) for a unit whose fader 4 is dead: the K2 map with three differences
//   fader 4               NO binding (a dead fader must never move anything, also when it sends noise)
//   pot 12                level of layer 4 (absolute; the knob right above the dead fader)
//   encoder 3 turn        third knob of the picked effect (fx param 3, relative); pots 9-11 stay mix, param 1, param 2
// Everything else is the same entry as in K2 (55 equal, 57 in all). Which console a deck uses is node.values.midiConsole.

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

/** K2 (1.9): the K2 map with fader 4 dropped, pot 12 = layer 4 level, encoder 3 = third effect knob. */
export const XONE_K2_19_MAP = XONE_K2_MAP
    .filter((entry) => entry.control !== 'fader 4')
    .map((entry) => {
        if (entry.control === 'pot 12') return bind('pot 12', 'opacity', { layer: 3 })
        if (entry.control === 'encoder 3') return bind('encoder 3', 'fx', { param: 2 }, { relative: true })
        return entry
    })

const freeOf = (map) => sheet.map((item) => item.control).filter((name) => !map.some((entry) => entry.control === name))

/** Sheet controls the default map leaves unbound (free for Learn). */
export const XONE_K2_FREE = freeOf(XONE_K2_MAP)
export const XONE_K2_19_FREE = freeOf(XONE_K2_19_MAP)

/** The consoles of the Xone:K2: the shown name and the map. A deck stores the id in values.midiConsole. */
export const K2_CONSOLE_DEFAULT = 'k2'
export const K2_CONSOLES = [
    { id: 'k2', name: 'K2', map: XONE_K2_MAP, free: XONE_K2_FREE },
    { id: 'k2-1.9', name: 'K2 (1.9)', map: XONE_K2_19_MAP, free: XONE_K2_19_FREE }
]
/** The console for a stored id; missing or unknown is K2. */
export const consoleOf = (id) => K2_CONSOLES.find((item) => item.id === id) || K2_CONSOLES[0]

/** note number → { red, amber, green } LED notes, from the sheet's led_notes. */
export const XONE_K2_LEDS = Object.fromEntries(
    sheet.filter((item) => item.kind === 'note' && item.led_notes).map((item) => [item.number, item.led_notes])
)

/** Is this control an encoder (relative) on the K2? For Learn. */
export const k2IsRelative = (match) => sheet.some((item) => item.kind === match.kind && item.number === match.number && item.mode === 'relative')

export const XONE_K2_CONTROLS = sheet

/** The map with the display name dropped, as applyMidi takes it. */
export const defaultMap = (consoleId) => consoleOf(consoleId).map.map(({ match, action, args, relative }) => ({ match, action, args, ...(relative ? { relative: true } : {}) }))

/** The input to listen on: the K2 by name, else the first one, else ''. */
export const pickInputId = (devices = []) => {
    const k2 = devices.find((device) => String(device.name || '').toUpperCase().includes(K2_NAME))
    return (k2 || devices[0])?.id || ''
}
export const isK2 = (device) => String(device?.name || '').toUpperCase().includes(K2_NAME)
