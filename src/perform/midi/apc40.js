// The Akai APC40 mkII console for the VJ deck. Every number comes from the control sheet beside this
// file (apc40-mk2-default.json), which was read out of a working Resolume Arena preset for this
// controller ("APC 40 MK II.xml"; Resolume uses the APC40 mkII in its generic mode, not an Ableton
// mode), looked up by control NAME, never typed here. A sheet row with verified:false is not in
// that preset: it continues a pattern the preset shows (same note numbers, next channel / next pad).
//
// Layout (layer / column are 1-based on the device, 0-based in the entries). The grid row is the layer
// and the clip grid is numbered note = (layer - 1) * 8 + (column - 1) on channel 1, layer 1 being the
// notes 0-7 (assumed to be the bottom row of pads, like layer 1 is the bottom of the deck):
//   pad grid 5 x 8        clip: row = layer 1-5 (BACK, BODY, CAM, WORDS, CUT), column 1-8
//   track faders 1-5      opacity of layers 1-5 (CC 7 on channel 1-5)
//   track bypass 1-5      bypass layers 1-5 (note 48 on channel 1-5; the key Resolume uses for bypass)
//   track solo 1-5        solo layers 1-5 (note 49 on channel 1-5)
//   track stop 1-8        play column 1-8 (note 52 on channel 1-8)
//   master fader          master
//   tempo knob            tempo nudge (relative)
//   tap tempo button      tap tempo
//   resync button         FREEZE while held (note 90)
//   device knobs 1-4      first effect of the selected layer: mix, then its first three params (K2 pots 9-12)
// Free (no deck action): cue level knob, device knobs 5-8, track knobs, scene launch, stop all clips,
// track 6-8 strips. Learn can bind any of them.
//
// LEDs: the deck lights the APC the way Resolume does (apc40Leds below); the APC's mode SysEx is not sent.

import sheet from './apc40-mk2-default.json'
import { ledColour } from './deckBinding.js'

export const APC40_CONSOLE_ID = 'apc40'
export const APC40_NAME = 'APC40'

const byName = new Map(sheet.map((control) => [control.control, control]))
const control = (name) => {
    const found = byName.get(name)
    if (!found) throw new Error(`apc40-mk2-default.json has no control "${name}"`)
    return found
}
const matchOf = (name) => {
    const { kind, number, channel } = control(name)
    return { kind, number, channel }
}
const bind = (name, action, args = {}, extra = {}) => ({ control: name, match: matchOf(name), action, args, ...extra })
const range = (count) => Array.from({ length: count }, (_, index) => index)

export const APC40_LAYERS = 5
export const APC40_COLUMNS = 8

// SHOW MAPPING (changed for the Platina show): one press = one whole look. The TOP pad row (layer 5, notes 32-39, the row
// Resolume used for column launch) launches columns 1-8 on every layer at once, like a click on the column number. The
// four track-stop keys 1-4 launch columns 9-12, so all 12 columns are reachable. Pad rows 1-4 still play one clip on
// BACK, BODY, CAM and WORDS (the CUT row is bypassed camera clips, so it was no use as clips).
const SHOW_COLUMN_ROW = APC40_LAYERS - 1
const SHOW_EXTRA_COLUMNS = 4

export const APC40_MAP = [
    ...range(APC40_LAYERS).flatMap((layer) => range(APC40_COLUMNS).map((column) => (layer === SHOW_COLUMN_ROW
        ? bind(`pad L${layer + 1} C${column + 1}`, 'column', { column })
        : bind(`pad L${layer + 1} C${column + 1}`, 'clip', { layer, column })))),
    ...range(SHOW_EXTRA_COLUMNS).map((index) => bind(`track ${index + 1} stop`, 'column', { column: APC40_COLUMNS + index })),
    ...range(APC40_LAYERS).map((layer) => bind(`track ${layer + 1} fader`, 'opacity', { layer })),
    ...range(APC40_LAYERS).map((layer) => bind(`track ${layer + 1} bypass`, 'bypass', { layer })),
    ...range(APC40_LAYERS).map((layer) => bind(`track ${layer + 1} solo`, 'solo', { layer })),
    bind('master fader', 'master'),
    bind('tempo knob', 'bpm', {}, { relative: true }),
    bind('tap tempo button', 'tap'),
    bind('resync button', 'hold'),
    // the bank arrows: right / left = next / previous scene (column), down / up = next / previous bank of 8 under the pads
    bind('bank right', 'columnNext'),
    bind('bank left', 'columnPrev'),
    bind('bank down', 'bankNext'),
    bind('bank up', 'bankPrev'),
    bind('bank button', 'bankNext'),
    bind('device knob 1', 'fx', { param: 'mix' }),
    ...range(3).map((i) => bind(`device knob ${i + 2}`, 'fx', { param: i }))
]

// BANKS: the deck can hold more columns than the 8 the pads show. Bank n puts columns n*8+1 .. n*8+8 under the pads
// (clip rows and the column row alike); the track-stop keys keep their own columns.
const isPadWithColumn = (entry) => entry?.match?.kind === 'note' && entry.match.number >= 0 && entry.match.number <= 39
    && (entry.action === 'clip' || entry.action === 'column') && Number.isInteger(entry.args?.column)
const isBankedPad = (entry) => isPadWithColumn(entry) && entry.args.column < APC40_COLUMNS

/** How many banks of pads a deck with this many columns has (at least 1). */
export const apc40BankCount = (columns) => Math.max(1, Math.ceil((Number(columns) || 0) / APC40_COLUMNS))

/**
 * The map as bank `bank` (0-based) plays it: every pad's column moved on by 8 per bank.
 * With `count` (how many banks the deck has) the columns go ROUND: a pad row bound to the second 8 columns shows the
 * first 8 in the last bank, so two rows of pads always hold 16 scenes between them, whatever the bank.
 */
export const apc40Banked = (map, bank, count = 0) => (bank > 0
    ? (map || []).map((entry) => {
        if (count > 0) return isPadWithColumn(entry) ? { ...entry, args: { ...entry.args, column: (entry.args.column + bank * APC40_COLUMNS) % (count * APC40_COLUMNS) } } : entry
        return isBankedPad(entry) ? { ...entry, args: { ...entry.args, column: entry.args.column + bank * APC40_COLUMNS } } : entry
    })
    : map)

/** Sheet controls the map leaves unbound (free for Learn). */
export const APC40_FREE = sheet.map((item) => item.control).filter((name) => !APC40_MAP.some((entry) => entry.control === name))

export const APC40_CONTROLS = sheet

/** Is this control an encoder (relative) on the APC40 mkII? For Learn. */
export const apc40IsRelative = (match) => sheet.some((item) => item.kind === match.kind && item.number === match.number && item.mode === 'relative')

const normal = (name) => String(name || '').toUpperCase().replace(/[\s_-]/g, '')
/** A MIDI port whose name contains APC40 ("APC40 mkII", "MIDIIN2 (APC40 mkII)", "APC 40 mkII"), any case. */
export const isApc40 = (device) => normal(device?.name).includes(APC40_NAME)

/** The console record: no `controller` face is drawn for it (k2Face.js); its LEDs come from apc40Leds, not a K2 LED table. */
export const APC40_CONSOLE = {
    id: APC40_CONSOLE_ID,
    name: 'APC40 mkII',
    controller: 'APC40 mkII',
    map: APC40_MAP,
    free: APC40_FREE,
    leds: {},
    isRelative: apc40IsRelative
}

// --- LEDs ---------------------------------------------------------------------------
// The APC40 mkII lights a button when it gets a note-on with the button's own note and channel. The clip pads
// (notes 0-39) and the scene launch buttons (82-86) are RGB: the velocity picks a colour from the APC's palette.
// The other buttons have one LED. Every value below is one Resolume's APC40 mkII preset sends ("APC 40 MK II.xml",
// Emily's Shortcuts/MIDI folder, NamedValues x 127):
//   clip pad      Empty 1 (dim), Disconnected 33 (clip loaded), Connected 52 (playing)
//   column pad    Off 1, On 33 (the deck shows playing as 52, like a playing clip)
//   scene launch  Off 1, On 33
//   bypass, solo, resync, stop all  Off 0, On 127
//   track stop    Off 0, On 1
export const APC40_LED = { EMPTY: 1, LOADED: 33, PLAYING: 52, SCENE_OFF: 1, SCENE_ON: 33, OFF: 0, ON: 127, STOP_ON: 1 }

const isPad = (note) => note >= 0 && note <= 39
const isScene = (note) => note >= 82 && note <= 86
const TRACK_STOP = 52
const AB_KEY = 66

/** The velocity one bound APC40 button shows for this deck. */
export const apc40Velocity = (deck, entry, ctx = {}) => {
    const note = entry.match.number
    const colour = ledColour(deck, entry, ctx)
    if (isPad(note)) {
        if (entry.action === 'clip' || entry.action === 'column') {
            return colour === 'green' ? APC40_LED.PLAYING : colour === 'amber' ? APC40_LED.LOADED : APC40_LED.EMPTY
        }
        return colour ? APC40_LED.LOADED : APC40_LED.EMPTY
    }
    if (isScene(note)) {
        // an effect switch: on = lit, off = dim, no effect in that slot = dark. Other scene keys (next effect…) stay dim.
        if (entry.action === 'fxToggle') return colour === 'green' ? APC40_LED.SCENE_ON : colour === 'red' ? APC40_LED.SCENE_OFF : APC40_LED.OFF
        return colour ? APC40_LED.SCENE_ON : APC40_LED.SCENE_OFF
    }
    if (note === TRACK_STOP) return colour === 'green' ? APC40_LED.STOP_ON : APC40_LED.OFF
    // the A|B key has two colours of its own: 1 = A, 2 = B
    if (note === AB_KEY && entry.action === 'side') return colour === 'amber' ? 1 : colour === 'green' ? 2 : APC40_LED.OFF
    // bypass lit = layer bypassed, solo lit = soloed, resync lit = freeze held
    return colour ? APC40_LED.ON : APC40_LED.OFF
}

/**
 * The whole APC40 LED picture for a deck: one { channel, note, velocity } per bound note (channel and note are the
 * control's own, so the track buttons that share a note on channels 1-8 stay apart). Pads with no binding are dark.
 */
export const apc40Leds = (deck, map, ctx = {}) => {
    const out = []
    const seen = new Set()
    for (const entry of map || []) {
        const match = entry?.match
        if (match?.kind !== 'note' || !Number.isInteger(match.number) || !Number.isInteger(match.channel)) continue
        const key = ledKey(match.channel, match.number)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ channel: match.channel, note: match.number, velocity: apc40Velocity(deck, entry, ctx) })
    }
    return out
}

const ledKey = (channel, note) => `${channel}:${note}`

/** Only the LED messages that differ from `sent` (a Map "channel:note" -> velocity); updates it. */
export const apc40LedChanges = (leds, sent) => {
    const changed = []
    for (const led of leds) {
        const key = ledKey(led.channel, led.note)
        if (sent.get(key) === led.velocity) continue
        sent.set(key, led.velocity)
        changed.push(led)
    }
    return changed
}

/** Switch off every lit button the new picture no longer mentions (a binding that went away); updates `sent`. */
export const apc40LedClears = (leds, sent) => {
    const now = new Set(leds.map((led) => ledKey(led.channel, led.note)))
    const off = []
    for (const [key, velocity] of sent) {
        if (now.has(key) || velocity === 0) continue
        sent.set(key, 0)
        const [channel, note] = key.split(':').map(Number)
        off.push({ channel, note, velocity: 0 })
    }
    return off
}
