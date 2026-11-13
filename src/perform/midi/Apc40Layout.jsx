import { describeAction, shortMatch } from './deckBinding.js'
import { APC40_CONTROLS } from './apc40.js'
import { TOUCH_MS, channelKey } from './k2Monitor.js'
import { effectLabel, effectNumericParams } from '../../project/tops/vjDeck.js'

// The Akai APC40 mkII drawn as rows, top to bottom as on the device, every control labelled with what it does NOW
// (the effective map: the APC40 default plus the deck's own bindings, effect knobs included) and lighting up when it
// is touched. Read only, like the K2 layout: mapping stays on right-click / MIDI mode. Shown inside K2LayoutPanel when
// the deck's console is the APC40.
//
// The APC40 repeats note / CC numbers across channels (the five faders are all CC 7, one channel each), so every
// control here is matched on kind + number + channel.

const range = (count) => Array.from({ length: count }, (_, index) => index)
const sheetName = new Map(APC40_CONTROLS.map((item) => [`${item.kind}:${item.number}@${item.channel}`, item.control]))
const at = (kind, number, channel, short, type) => ({
    kind, number, channel, short, type,
    name: sheetName.get(`${kind}:${number}@${channel}`) || `${kind} ${number} ch ${channel}`
})

// The pad grid: the top row is layer 5 (notes 32-39) with scene launch 1 (note 82) at its right; the bottom row is
// layer 1 (notes 0-7) with scene launch 5 (note 86).
export const APC40_LAYOUT = [
    { id: 'track-knobs', title: 'Track knobs (top row)', cells: range(8).map((i) => at('cc', 48 + i, 1, `knob ${i + 1}`, 'pot')) },
    { id: 'device-knobs', title: 'Device knobs (right side)', cells: range(8).map((i) => at('cc', 16 + i, 1, `device ${i + 1}`, 'pot')) },
    ...range(5).map((row) => {
        const layer = 4 - row
        return {
            id: `pads-${layer + 1}`,
            title: `Pad row ${row + 1} (layer ${layer + 1})`,
            cells: [...range(8).map((c) => at('note', layer * 8 + c, 1, `${layer + 1}·${c + 1}`, 'pad')), at('note', 82 + row, 1, `scene ${row + 1}`, 'scene')]
        }
    }),
    { id: 'select', title: 'Track select keys (note 51) and master select', cells: [...range(8).map((i) => at('note', 51, i + 1, `select ${i + 1}`, 'button')), at('note', 80, 1, 'master', 'button')] },
    { id: 'activator', title: 'Activator keys, note 50', cells: range(8).map((i) => at('note', 50, i + 1, `act ${i + 1}`, 'button')) },
    { id: 'ab', title: 'A|B keys, note 66', cells: range(8).map((i) => at('note', 66, i + 1, `A|B ${i + 1}`, 'button')) },
    { id: 'stops', title: 'Clip stop keys', cells: [...range(8).map((i) => at('note', 52, i + 1, `stop ${i + 1}`, 'button')), at('note', 81, 1, 'stop all', 'button')] },
    { id: 'solo', title: 'Track keys, note 49', cells: range(8).map((i) => at('note', 49, i + 1, `S ${i + 1}`, 'button')) },
    { id: 'bypass', title: 'Track keys, note 48', cells: range(8).map((i) => at('note', 48, i + 1, `B ${i + 1}`, 'button')) },
    { id: 'faders', title: 'Faders', cells: [...range(8).map((i) => at('cc', 7, i + 1, `fader ${i + 1}`, 'fader')), at('cc', 14, 1, 'master', 'fader')] },
    { id: 'other', title: 'Tempo and more', cells: [at('cc', 13, 1, 'tempo', 'encoder'), at('note', 99, 1, 'tap', 'button'), at('note', 90, 1, 'resync', 'button'), at('cc', 47, 1, 'cue level', 'encoder'), at('cc', 15, 1, 'crossfader', 'fader')] },
    { id: 'bank', title: 'Bank arrows', cells: [at('note', 97, 1, 'left', 'button'), at('note', 96, 1, 'right', 'button'), at('note', 94, 1, 'up', 'button'), at('note', 95, 1, 'down', 'button'), at('note', 103, 1, 'BANK', 'button')] }
]

const sameControl = (match, item) => match && match.kind === item.kind && match.number === item.number && (match.channel || 0) === item.channel

/** The entry of the effective map a control triggers, or null. */
export const apc40EntryOf = (map, item) => (Array.isArray(map) ? map : []).find((entry) => sameControl(entry?.match, item)) || null

const plainLayer = (name) => String(name || '').replace(/^\s*\d+\s*/, '').trim()
const NOTHING = 'nothing here'
const layerName = (deck, index) => plainLayer(deck?.layers?.[index]?.name) || `L${index + 1}`
const PRESS_WORDS = { hit: 'burst', punch: 'punch-in', flip: 'flip', neg: 'negative', strobe: 'strobe', black: 'black', multi: 'screens' }

/** "Glow · amount" (plus " (off)" when the effect is off); 'nothing here' when the effect or its param does not exist. */
const effectJob = (effect, param) => {
    if (!effect) return NOTHING
    const label = param === 'mix' ? 'amount' : effectNumericParams(effect.type)[param]?.label
    if (!label) return NOTHING
    return `${effectLabel(effect.type)} · ${label}${effect.on === false ? ' (off)' : ''}`
}

/** What a control does, in plain words: scene names, "layer · clip", "effect · param", "HOLD burst". No entry = 'free'. */
export const apc40Job = (entry, deck, fxEffect = 0) => {
    if (!entry) return 'free'
    const args = entry.args || {}
    switch (entry.action) {
        case 'column': {
            if (!Number.isInteger(args.column)) break
            return deck?.layers?.[0]?.clips?.[args.column]?.label || `Scene ${args.column + 1}`
        }
        case 'clip': {
            if (!Number.isInteger(args.layer) || !Number.isInteger(args.column)) break
            const clip = deck?.layers?.[args.layer]?.clips?.[args.column]
            return clip ? `${layerName(deck, args.layer)} · ${clip.label || `clip ${args.column + 1}`}` : NOTHING
        }
        case 'fx': {
            if (!Number.isInteger(args.layer) || !Number.isInteger(args.effect)) break
            if (args.layer < 0) return effectJob(deck?.effects?.[args.effect], args.param)
            const effect = deck?.layers?.[args.layer]?.effects?.[args.effect]
            return effect ? `${layerName(deck, args.layer)} · ${effectJob(effect, args.param)}` : NOTHING
        }
        case 'fxPress': return `HOLD ${PRESS_WORDS[args.param] || args.param || ''}`.trim()
        case 'fxSet': return typeof args.label === 'string' && args.label ? args.label : `${effectLabel(args.type)} · ${args.param} ${args.value}`
        case 'columnNext': return 'Next scene'
        case 'columnPrev': return 'Previous scene'
        case 'bankNext': return 'Next 8 scenes'
        case 'bankPrev': return 'Previous 8 scenes'
        default: break
    }
    return describeAction(entry, { fxEffect })
}

export default function Apc40Layout({ map, deck, snap, faded, fxEffect = 0, selected = '', onSelect }) {
    const control = (item) => {
        const key = channelKey(item.kind, item.number, item.channel)
        const entry = apc40EntryOf(map, item)
        const label = apc40Job(entry, deck, fxEffect)
        const held = Boolean(snap?.held?.[key])
        const lit = Boolean(snap) && faded !== snap && (held || snap.at - (snap.touched?.[key] ?? -Infinity) < TOUCH_MS)
        const analog = item.type === 'pot' || item.type === 'fader'
        const value = snap?.values?.[key]
        const fill = analog && Number.isFinite(value) ? Math.round((value / 127) * 100) : null
        const id = `${item.kind}:${item.number}@${item.channel}`
        return (
            <button
                key={id}
                type="button"
                className={`k2-control apc-control apc-control--${item.type}${item.type === 'pot' || item.type === 'fader' ? ` k2-control--${item.type}` : ''}${lit ? ' is-lit' : ''}${held ? ' is-held' : ''}${selected === id ? ' is-selected' : ''}${entry ? '' : ' is-free'}`}
                data-apc={id}
                aria-label={`${item.name}: ${label}`}
                aria-pressed={selected === id}
                style={fill === null ? undefined : { '--k2-fill': `${fill}%` }}
                onClick={() => onSelect?.(selected === id ? '' : id)}
            >
                <span className="k2-control-name">{item.short}</span>
                <span className="k2-control-what">{label}</span>
            </button>
        )
    }
    const chosen = APC40_LAYOUT.flatMap((row) => row.cells).find((item) => `${item.kind}:${item.number}@${item.channel}` === selected)
    const detail = chosen
        ? `${chosen.name} · ${shortMatch(chosen)} ch ${chosen.channel} · ${apc40Job(apc40EntryOf(map, chosen), deck, fxEffect)}`
        : 'Touch a control on the APC40 (it lights here) or click one to see its message and what it does'
    return (
        <div className="apc-body">
            {APC40_LAYOUT.map((row) => (
                <div key={row.id} className="apc-row" role="group" aria-label={row.title}>
                    <span className="apc-row-title">{row.title}</span>
                    <div className="apc-cells" style={{ '--apc-cols': row.cells.length }}>{row.cells.map(control)}</div>
                </div>
            ))}
            <p className="k2-detail" role="status" aria-live="polite">{detail}</p>
        </div>
    )
}
