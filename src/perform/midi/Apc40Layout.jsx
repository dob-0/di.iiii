import { describeAction, shortMatch } from './deckBinding.js'
import { APC40_CONTROLS } from './apc40.js'
import { TOUCH_MS, channelKey } from './k2Monitor.js'

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
    { id: 'stops', title: 'Clip stop keys', cells: [...range(8).map((i) => at('note', 52, i + 1, `stop ${i + 1}`, 'button')), at('note', 81, 1, 'stop all', 'button')] },
    { id: 'solo', title: 'Track keys, note 49', cells: range(8).map((i) => at('note', 49, i + 1, `S ${i + 1}`, 'button')) },
    { id: 'bypass', title: 'Track keys, note 48', cells: range(8).map((i) => at('note', 48, i + 1, `B ${i + 1}`, 'button')) },
    { id: 'faders', title: 'Faders', cells: [...range(8).map((i) => at('cc', 7, i + 1, `fader ${i + 1}`, 'fader')), at('cc', 14, 1, 'master', 'fader')] },
    { id: 'other', title: 'Tempo and more', cells: [at('cc', 13, 1, 'tempo', 'encoder'), at('note', 99, 1, 'tap', 'button'), at('note', 90, 1, 'resync', 'button'), at('cc', 47, 1, 'cue level', 'encoder')] }
]

const sameControl = (match, item) => match && match.kind === item.kind && match.number === item.number && (match.channel || 0) === item.channel

/** The entry of the effective map a control triggers, or null. */
export const apc40EntryOf = (map, item) => (Array.isArray(map) ? map : []).find((entry) => sameControl(entry?.match, item)) || null

const plainLayer = (name) => String(name || '').replace(/^\s*\d+\s*/, '').trim()
const plainEffect = (type) => String(type || '').replace(/^top\./, '')

/** What a control does, in short words; effect knobs name the layer and the effect ("CAM pixelate mix"). */
export const apc40Job = (entry, deck, fxEffect = 0) => {
    if (!entry) return 'not used'
    const args = entry.args || {}
    if (entry.action === 'fx' && Number.isInteger(args.layer) && Number.isInteger(args.effect)) {
        const stack = args.layer >= 0 ? deck?.layers?.[args.layer] : null
        const effect = (args.layer >= 0 ? stack?.effects : deck?.effects)?.[args.effect]
        const where = args.layer >= 0 ? plainLayer(stack?.name) || `L${args.layer + 1}` : 'Master'
        const what = effect ? plainEffect(effect.type) : `fx ${args.effect + 1}`
        const param = args.param === 'mix' ? 'mix' : Number.isInteger(args.param) ? `param ${args.param + 1}` : ''
        return `${where} ${what} ${param}`.trim()
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
