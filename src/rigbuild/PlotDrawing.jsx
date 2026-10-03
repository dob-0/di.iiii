import { Fragment, useEffect, useMemo } from 'react'
import { dimension, formatMetres, layoutLabels, placeNotes } from './plotGeometry.js'
import { isFilledShape, lampNotation, meaningfulColour, shapePath } from './plotSymbols.js'
import { FLAG_WORDS } from './sheet.js'

// THE PLOT, DRAWN — one SVG renderer for the screen and the paper
// (docs/architecture/RIG_BUILD.md §10). Coordinates are the room's metres seen from
// above (x right, z down the sheet). Every line weight and text size is given in
// UNITS and multiplied by `u`, the metres one unit is worth: a CSS pixel on screen,
// a millimetre on paper at 1:N (u = N / 1000). So the same drawing reads at any zoom
// and prints at a true scale.
//
// Conventions (drawing practice, ISO 128-2 line types, USITT RP-2 notation):
//   walls        continuous, heavy            columns   solid black
//   grid         thin chain line, lettered/numbered bubbles at the edge of the view
//   overhead     dashed (above the plan's cut): crane runways and bridges, lanterns
//   zones        thin chain outline, the name in capitals
//   machinery    hatched, its height written on it
//   pieces       truss drawn with its lacing, a tower as its base plate crossed, a
//                deck with its height
//   lamps        one symbol per type at the hanging point (the mount); the unit #
//                inside, the console's fixture # and universe.address beside it
//   conflicts    a dashed box and a flag word — never a colour

const EMPTY = new Set()

// The dashed circle at a run's loose end; said once, in the key (PlotSurface, PlotPrint), not at each end.
export const FREE_END_WORDS = 'free end · no tower under it'

export const SCREEN_SIZES = { stroke: 1, heavy: 2.4, text: 10.5, small: 8.5, tiny: 7.5, symbol: 7, gap: 2, bubble: 8 }
export const PAPER_SIZES = { stroke: 0.18, heavy: 0.5, text: 1.9, small: 1.5, tiny: 1.3, symbol: 1.5, gap: 0.4, bubble: 1.8 }

const ptsOf = (poly) => poly.map(([x, z]) => `${x},${z}`).join(' ')

// The room around the middle of a rig is crowded: zone names, machine heights, the truss line's
// dimension and the lamps' numbers all want the same square metre. Every NOTE (not a lamp's
// number — layoutLabels owns those) is placed by placeNotes: the first spot that is clear of the
// symbols, the lamp labels shown, the pieces and the notes before it; a note with no clear spot
// is left out (zoom in) — except a dimension, which is data and takes its least-bad spot.
const textBox = (x, y, text, size, anchor = 'start', caps = false) => {
    const w = text.length * size * (caps ? 0.7 : 0.62)
    const x0 = anchor === 'end' ? x - w : x
    return [x0, y - size, x0 + w, y + size * 0.3]
}
const zoneText = (z) => `${z.label} · ${formatMetres(z.rects[0][2] - z.rects[0][0]).replace(' m', '')} × ${formatMetres(z.rects[0][3] - z.rects[0][1])}`
const runText = (run, named) => `${named && run.name ? `${run.name} · ` : ''}${formatMetres(run.length)} · h ${formatMetres(run.height)}`

const Hatch = ({ id, u, s }) => (
    <pattern id={id} patternUnits="userSpaceOnUse" width={6 * u * s.stroke * 4} height={6 * u * s.stroke * 4} patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2={6 * u * s.stroke * 4} stroke="#8c8c8c" strokeWidth={u * s.stroke * 0.8} />
    </pattern>
)

function Venue({ plan, u, s, view, idPrefix, placed }) {
    if (!plan) return null
    const [vx, vy, vw, vh] = view
    const chain = `${8 * u * s.stroke * 3} ${2 * u * s.stroke * 3} ${1.5 * u * s.stroke * 3} ${2 * u * s.stroke * 3}`
    const dash = `${5 * u * s.stroke * 3} ${3 * u * s.stroke * 3}`
    return (
        <g className="rigplot-venue">
            {/* grid, with bubbles at the top and left edges of what is shown */}
            <g stroke="#9a9a9a" strokeWidth={u * s.stroke * 0.7} strokeDasharray={chain} fill="none">
                {plan.grid.x.map((g) => <line key={`gx${g.at}`} x1={g.at} y1={vy} x2={g.at} y2={vy + vh} />)}
                {plan.grid.z.map((g) => <line key={`gz${g.at}`} x1={vx} y1={g.at} x2={vx + vw} y2={g.at} />)}
            </g>
            {/* zones */}
            {plan.zones.map((z) => (
                <g key={z.id} className="rigplot-zone">
                    {z.rects.map((r, i) => (
                        <rect key={i} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} fill="none" stroke="#6d6d6d" strokeWidth={u * s.stroke} strokeDasharray={chain} />
                    ))}
                    {placed.zones.get(z.id) ? (
                        <text x={placed.zones.get(z.id).x} y={placed.zones.get(z.id).y} textAnchor={placed.zones.get(z.id).anchor} fontSize={s.small * u} fill="#555" className="rigplot-mono rigplot-caps">
                            {placed.zones.get(z.id).text}
                        </text>
                    ) : null}
                </g>
            ))}
            {/* machinery on the floor */}
            {plan.solids.map((m) => (
                <g key={m.id}>
                    <rect x={m.rect[0]} y={m.rect[1]} width={m.rect[2] - m.rect[0]} height={m.rect[3] - m.rect[1]} fill={`url(#${idPrefix}hatch)`} stroke="#333" strokeWidth={u * s.stroke} />
                </g>
            ))}
            {/* overhead: dashed */}
            <g fill="none" stroke="#7a7a7a" strokeWidth={u * s.stroke * 0.8} strokeDasharray={dash}>
                {plan.overhead.map((o) => (o.rect
                    ? <rect key={o.id} x={o.rect[0]} y={o.rect[1]} width={o.rect[2] - o.rect[0]} height={o.rect[3] - o.rect[1]} />
                    : <line key={o.id} x1={o.line[0][0]} y1={o.line[0][1]} x2={o.line[1][0]} y2={o.line[1][1]} />))}
            </g>
            {/* columns */}
            <g fill="#111">
                {plan.columns.map(([x, z, w, d]) => <rect key={`c${x},${z}`} x={x - w / 2} y={z - d / 2} width={w} height={d} />)}
            </g>
            {/* walls, heavy, with the openings cut in */}
            <polygon points={ptsOf(plan.outline)} fill="none" stroke="#111" strokeWidth={u * s.heavy} />
            {plan.openings.map((o) => (
                <g key={o.id}>
                    <line x1={o.from[0]} y1={o.from[1]} x2={o.to[0]} y2={o.to[1]} stroke="#fff" strokeWidth={u * s.heavy * 1.6} />
                    <text x={(o.from[0] + o.to[0]) / 2} y={o.from[1] - 1.2 * s.small * u * Math.sign(o.from[1] || 1)} fontSize={s.small * u} textAnchor="middle" fill="#444" className="rigplot-mono">{o.label}</text>
                </g>
            ))}
        </g>
    )
}

// The grid's bubbles sit at the edges of what is shown, over everything else.
function GridBubbles({ plan, u, s, view }) {
    if (!plan) return null
    const [vx, vy, vw, vh] = view
    const b = s.bubble * u
    return (
        <g fontSize={s.tiny * u} textAnchor="middle" dominantBaseline="central" className="rigplot-mono">
                {plan.grid.x.filter((g) => g.at > vx + b && g.at < vx + vw - b).map((g) => (
                    <g key={`bx${g.at}`}>
                        <circle cx={g.at} cy={vy + b * 1.2} r={b} fill="#fff" stroke="#444" strokeWidth={u * s.stroke} />
                        <text x={g.at} y={vy + b * 1.2}>{g.label}</text>
                    </g>
                ))}
                {plan.grid.z.filter((g) => g.at > vy + b * 3 && g.at < vy + vh - b).map((g, i, list) => (
                    // Two lines closer than a bubble (the joint pair) share one bubble.
                    i > 0 && Math.abs(list[i - 1].at - g.at) < b * 2 ? null : (
                        <g key={`bz${g.at}`}>
                            <circle cx={vx + b * 1.2} cy={g.at} r={b} fill="#fff" stroke="#444" strokeWidth={u * s.stroke} />
                            <text x={vx + b * 1.2} y={g.at}>{g.label.replace('′', '')}</text>
                        </g>
                    )
                ))}
            </g>
    )
}

// Labels for what is not a lamp: machinery heights, overhead names. Placed after
// the lamps so they never cover a symbol's notation.
function VenueNotes({ plan, u, s, placed }) {
    if (!plan) return null
    return (
        <g fontSize={s.tiny * u} fill="#555" className="rigplot-mono">
            {[...placed.notes.values()].map((n) => (n ? <text key={n.id} x={n.x} y={n.y}>{n.text}</text> : null))}
        </g>
    )
}

function Truss({ p, u, s, selected }) {
    // The outline, the two chords and the lacing (one diagonal per 0.5 m bay).
    const [a, b, c, d] = p.outline
    const bays = Math.max(1, Math.round(p.w / 0.5))
    const lerp = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]
    const zig = []
    for (let i = 0; i <= bays; i++) zig.push(i % 2 ? lerp(d, c, i / bays) : lerp(a, b, i / bays))
    return (
        <g>
            <polygon points={ptsOf(p.outline)} fill="#fff" stroke="#111" strokeWidth={u * s.stroke * (selected ? 2.6 : 1.2)} />
            <polyline points={ptsOf(zig)} fill="none" stroke="#111" strokeWidth={u * s.stroke * 0.6} />
        </g>
    )
}

function Piece({ p, u, s, selected }) {
    if (p.category === 'truss') return <Truss p={p} u={u} s={s} selected={selected} />
    const [a, b, c, d] = p.outline
    return (
        <g>
            <polygon points={ptsOf(p.outline)} fill={p.category === 'tower' ? '#fff' : '#f4f4f2'} stroke="#111" strokeWidth={u * s.stroke * (selected ? 2.6 : 1.2)} />
            {p.category === 'tower'
                ? <path d={`M${a[0]},${a[1]}L${c[0]},${c[1]}M${b[0]},${b[1]}L${d[0]},${d[1]}`} stroke="#111" strokeWidth={u * s.stroke * 0.8} />
                : <path d={`M${a[0]},${a[1]}L${c[0]},${c[1]}`} stroke="#999" strokeWidth={u * s.stroke * 0.6} />}
        </g>
    )
}

function RunDimension({ run, u, s, offset, label }) {
    const dim = dimension(run.from, run.to, offset)
    const tick = 2 * u * s.text * 0.3
    return (
        <g stroke="#333" strokeWidth={u * s.stroke * 0.7} fill="none">
            <line x1={dim.from[0][0]} y1={dim.from[0][1]} x2={dim.a[0]} y2={dim.a[1]} />
            <line x1={dim.from[1][0]} y1={dim.from[1][1]} x2={dim.b[0]} y2={dim.b[1]} />
            <line x1={dim.a[0]} y1={dim.a[1]} x2={dim.b[0]} y2={dim.b[1]} />
            {[dim.a, dim.b].map((p, i) => <line key={i} x1={p[0] - tick} y1={p[1] + tick} x2={p[0] + tick} y2={p[1] - tick} />)}
            <text
                x={dim.mid[0]} y={dim.mid[1] - 0.5 * s.small * u} fontSize={s.small * u} textAnchor="middle" stroke="none" fill="#111"
                transform={`rotate(${dim.angle} ${dim.mid[0]} ${dim.mid[1]})`} className="rigplot-mono"
            >
                {label}
            </text>
        </g>
    )
}

/**
 * @param {object} props
 * @param {object} props.model        plotModel()
 * @param {number} props.u            metres per unit
 * @param {object} props.sizes        SCREEN_SIZES or PAPER_SIZES
 * @param {number[]} props.view       [x, y, w, h] metres shown (for edge bubbles and culling)
 * @param {Set<string>} [props.selected]
 * @param {boolean} [props.hideCrowded] leave out a label that cannot be placed clear
 * @param {(n: number) => void} [props.onHidden]
 */
export default function PlotDrawing({ model, u, sizes: s = SCREEN_SIZES, view, selected = EMPTY, hideCrowded = true, idPrefix = 'p', onHidden, children }) {
    const r0 = s.symbol * u
    const [vx, vy, vw, vh] = view
    const margin = 4 * r0
    const visible = (x, z) => x > vx - margin && x < vx + vw + margin && z > vy - margin && z < vy + vh + margin

    const lamps = useMemo(() => model.lamps.filter((l) => visible(l.at[0], l.at[1])), [model.lamps, vx, vy, vw, vh, margin]) // eslint-disable-line react-hooks/exhaustive-deps
    const labels = useMemo(() => {
        const text = s.small * u
        const items = lamps.filter((l) => l.index != null || l.row?.universe != null || selected.has(l.id) || l.conflicts.length).map((l) => {
            const n = lampNotation(l.row || l)
            const chars = Math.max(n.number.length, n.address.length)
            return { id: l.id, at: l.at, r: r0 * 1.15, w: chars * 0.62 * text, h: 2.15 * text, n }
        })
        // Conflicts first: their labels matter most.
        items.sort((a, b) => (model.lamps.find((l) => l.id === b.id)?.conflicts.length ? 1 : 0) - (model.lamps.find((l) => l.id === a.id)?.conflicts.length ? 1 : 0))
        return { items: new Map(items.map((i) => [i.id, i])), placed: layoutLabels(items, s.gap * u) }
    }, [lamps, u, s, r0, model.lamps, selected])

    const placed = useMemo(() => {
        const plan = model.venue
        const sm = s.small * u
        const tiny = s.tiny * u
        // what the notes must keep clear of: the symbols, the lamp labels shown, the pieces
        const blockers = []
        for (const l of lamps) {
            const [x, z] = l.at
            blockers.push([x - r0 * 1.2, z - r0 * 1.2, x + r0 * 1.2, z + r0 * 1.2])
            const place = labels.placed.get(l.id)
            const mute = l.index == null && l.row?.universe == null
            if (place && (selected.has(l.id) || l.conflicts.length || (!mute && (!hideCrowded || place.clear)))) blockers.push(place.box)
        }
        for (const p of model.pieces) {
            const xs = p.outline.map((q) => q[0])
            const zs = p.outline.map((q) => q[1])
            blockers.push([Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)])
        }
        const notes = []
        // the dimension of each truss run: beside it on either side, farther out each try, then without its name
        for (const run of model.runs) {
            const boxes = []
            const tries = []
            for (const named of run.name ? [true, false] : [false]) {
                for (const k of [0, 1, 2, 3]) {
                    for (const side of [-1, 1]) {
                        const offset = side * (3.2 + 1.6 * k) * s.text * u
                        const label = runText(run, named)
                        const dim = dimension(run.from, run.to, offset)
                        const rad = (dim.angle * Math.PI) / 180
                        const hl = (label.length * sm * 0.62) / 2
                        const hh = sm * 0.8
                        const ex = Math.abs(Math.cos(rad)) * hl + Math.abs(Math.sin(rad)) * hh
                        const ey = Math.abs(Math.sin(rad)) * hl + Math.abs(Math.cos(rad)) * hh
                        boxes.push([dim.mid[0] - ex, dim.mid[1] - ey, dim.mid[0] + ex, dim.mid[1] + ey])
                        tries.push({ offset, label })
                    }
                }
            }
            notes.push({ id: `run:${run.ids[0]}`, keep: true, boxes, tries })
        }
        if (plan) {
            for (const z of plan.zones) {
                // the name with its size, then the name alone; each from the top of the zone, then up from the foot
                const [x0, y0, x1, y1] = z.rects[0]
                const tries = []
                for (const text of [zoneText(z), z.label]) {
                    for (const k of [0, 1, 2, 3, 4]) tries.push({ x: x0 + 1.2 * sm, y: y0 + 1.6 * sm + k * 1.3 * sm, anchor: 'start', text })
                    for (const k of [0, 1, 2]) tries.push({ x: x1 - 1.2 * sm, y: y0 + 1.6 * sm + k * 1.3 * sm, anchor: 'end', text })
                    for (const k of [0, 1, 2]) tries.push({ x: x0 + 1.2 * sm, y: y1 - 0.8 * sm - k * 1.3 * sm, anchor: 'start', text })
                    for (const k of [0, 1, 2]) tries.push({ x: x1 - 1.2 * sm, y: y1 - 0.8 * sm - k * 1.3 * sm, anchor: 'end', text })
                }
                notes.push({ id: `zone:${z.id}`, boxes: tries.map((t) => textBox(t.x, t.y, t.text, sm, t.anchor, true)), tries })
            }
            const [vx, vy, vw, vh] = view
            const inView = (x, z) => x > vx && x < vx + vw && z > vy && z < vy + vh
            // written only where the thing is wide enough to carry it (12 characters at this scale)
            const roomy = (w) => w / u >= 12 * s.tiny * 0.62
            for (const m of plan.solids) {
                if (!inView(m.rect[0], m.rect[3]) || !roomy(m.rect[2] - m.rect[0])) continue
                const text = `${m.label} · ${m.top} m`
                const tries = [0, 1, 2, 3].map((k) => ({ x: m.rect[0], y: m.rect[3] + (1.3 + k * 1.2) * tiny, text }))
                notes.push({ id: `solid:${m.id}`, boxes: tries.map((t) => textBox(t.x, t.y, text, tiny)), tries })
            }
            const seen = new Set()
            for (const o of plan.overhead) {
                if (seen.has(o.label)) continue
                const [x, z] = o.rect ? [o.rect[0], o.rect[1]] : o.line[0][1] === o.line[1][1] ? [o.line[0][0], o.line[0][1]] : [o.line[0][0], vy + vh * 0.5]
                if (!inView(x, z)) continue
                if (o.rect && !roomy(o.rect[2] - o.rect[0])) continue
                seen.add(o.label)
                const text = `${o.label} over · ${o.bottom} m`
                const tries = [0, 1, 2, -1].map((k) => ({ x: x + tiny * 0.6, y: z - tiny * 0.5 + k * 1.2 * tiny, text }))
                notes.push({ id: `over:${o.id}`, boxes: tries.map((t) => textBox(t.x, t.y, text, tiny)), tries })
            }
        }
        const chosen = placeNotes(notes, blockers)
        const dims = new Map()
        const zones = new Map()
        const others = new Map()
        for (const n of notes) {
            const at = chosen.get(n.id)
            const t = at >= 0 ? n.tries[at] : null
            if (n.id.startsWith('run:')) dims.set(n.id.slice(4), t || n.tries[0])
            else if (n.id.startsWith('zone:')) zones.set(n.id.slice(5), t)
            else others.set(n.id, t ? { x: t.x, y: t.y, text: t.text } : null)
        }
        return { dims, zones, notes: others }
    }, [lamps, labels, selected, model.pieces, model.runs, model.venue, u, s, r0, view, hideCrowded])

    const hidden = hideCrowded ? [...labels.placed.values()].filter((p) => !p.clear).length : 0
    useEffect(() => { onHidden?.(hidden) }, [hidden, onHidden])

    return (
        <g className="rigplot-drawing" data-hidden-labels={hidden}>
            <defs><Hatch id={`${idPrefix}hatch`} u={u} s={s} /></defs>
            <Venue plan={model.venue} u={u} s={s} view={view} idPrefix={idPrefix} placed={placed} />
            {model.boxes.map((b) => (
                <polygon key={b.id} points={ptsOf(b.outline)} fill="none" stroke="#555" strokeWidth={u * s.stroke * 0.8} />
            ))}
            {model.pieces.map((p) => (
                <g key={p.id} data-id={p.id}><Piece p={p} u={u} s={s} selected={selected.has(p.id)} /></g>
            ))}
            {model.pieces.filter((p) => p.category === 'deck').map((p) => (
                <text key={`h${p.id}`} x={p.position[0]} y={p.position[2]} fontSize={s.tiny * u} textAnchor="middle" dominantBaseline="central" fill="#333" className="rigplot-mono">{`h ${p.height}`}</text>
            ))}
            {model.runs.map((run) => <RunDimension key={run.ids[0]} run={run} u={u} s={s} offset={placed.dims.get(run.ids[0]).offset} label={placed.dims.get(run.ids[0]).label} />)}
            {(model.freeEnds || []).map((f, i) => (
                <g key={`free${i}`} className="rigplot-mono">
                    <circle cx={f.at[0]} cy={f.at[1]} r={r0 * 0.8} fill="#fff" stroke="#111" strokeWidth={u * s.stroke} strokeDasharray={`${u * s.stroke * 2} ${u * s.stroke * 1.5}`} />
                    <title>{FREE_END_WORDS}</title>
                </g>
            ))}
            {lamps.map((l) => {
                const shape = model.table.get(l.type) || { shape: 'cross', letter: '' }
                const [x, z] = l.at
                const sel = selected.has(l.id)
                const colour = meaningfulColour(l.colour)
                const n = lampNotation(l.row || l)
                const place = labels.placed.get(l.id) || { x, y: z, anchor: 'middle', box: [x, z, x, z], clear: false }
                // A lamp with no number and no address has nothing to say beside it (its
                // type's mode is owed — the key says so once); it gets its label when chosen.
                const mute = l.index == null && l.row?.universe == null
                const showLabel = sel || l.conflicts.length || (!mute && (!hideCrowded || place.clear))
                const text = s.small * u
                return (
                    <g key={l.id} data-id={l.id} className="rigplot-lamp">
                        {sel ? <circle cx={x} cy={z} r={r0 * 1.75} fill="#e6e6e6" stroke="#111" strokeWidth={u * s.stroke * 1.4} /> : null}
                        <path
                            d={shapePath(shape.shape, x, z, r0)}
                            fill={isFilledShape(shape.shape) ? '#111' : '#fff'}
                            stroke="#111" strokeWidth={u * s.stroke * 1.2} strokeLinejoin="round"
                        />
                        {shape.letter ? (
                            <text x={x} y={z + r0 * 0.3} fontSize={r0 * 0.95} textAnchor="middle" dominantBaseline="central" className="rigplot-mono">{shape.letter}</text>
                        ) : n.unit && !isFilledShape(shape.shape) && r0 >= s.tiny * u * 0.75 ? (
                            <text x={x} y={z} fontSize={Math.min(r0 * 1.05, s.tiny * u)} textAnchor="middle" dominantBaseline="central" className="rigplot-mono">{n.unit}</text>
                        ) : null}
                        {colour ? <circle cx={x + r0 * 0.9} cy={z - r0 * 0.9} r={r0 * 0.38} fill={colour} stroke="#111" strokeWidth={u * s.stroke * 0.5} /> : null}
                        {l.conflicts.length ? (
                            <g>
                                <rect x={x - r0 * 1.6} y={z - r0 * 1.6} width={r0 * 3.2} height={r0 * 3.2} fill="none" stroke="#111" strokeWidth={u * s.stroke * 1.2} strokeDasharray={`${u * s.stroke * 3} ${u * s.stroke * 2}`} />
                                <text x={x + r0 * 1.8} y={z - r0 * 1.2} fontSize={s.text * u} fontWeight="700" className="rigplot-mono">!</text>
                            </g>
                        ) : null}
                        {showLabel ? (
                            <text x={place.x} y={place.box[1]} fontSize={text} textAnchor={place.anchor} className="rigplot-mono" fill="#111">
                                <tspan x={place.x} dy={text * 0.95} fontWeight="600">{n.number}</tspan>
                                <tspan x={place.x} dy={text * 1.05} fill={l.row?.universe != null ? '#111' : '#777'}>{n.address}</tspan>
                            </text>
                        ) : null}
                    </g>
                )
            })}
            <VenueNotes plan={model.venue} u={u} s={s} placed={placed} />
            <GridBubbles plan={model.venue} u={u} s={s} view={view} />
            {children}
        </g>
    )
}

/** The flag words for a lamp's conflicts, as the inspector and the sheet say them. */
export const conflictWords = (lamp) => lamp.conflicts.map((c) => FLAG_WORDS[c] || c)

export { Fragment }
