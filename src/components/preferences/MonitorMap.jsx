import { useEffect, useMemo, useState } from 'react'

// Live graph of the contract's `map`: repos and agents on the left, then
// machines -> tiers -> spaces -> shows. Deterministic layered layout in plain
// SVG (no graph library): a node's column comes from its kind, its row from
// the average row of its neighbours in the column before. At phone width the
// same nodes are a grouped list.

const COLUMNS = ['repo', 'agent', 'machine', 'tier', 'space', 'show']
const KIND_TITLE = { repo: 'Repos', agent: 'Agents', machine: 'Machines', tier: 'Tiers', space: 'Spaces', show: 'Shows' }
const STATE_TONE = { ok: 'success', warn: 'warning', off: 'muted' }
const COL_W = 154
const NODE_W = 136
const NODE_H = 28
const ROW_H = 38
const PAD = 12
const PHONE_QUERY = '(max-width: 600px)'

export const useNarrow = () => {
    const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY).matches : false)
    const [narrow, setNarrow] = useState(get)
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mq = window.matchMedia(PHONE_QUERY)
        const on = () => setNarrow(mq.matches)
        on()
        mq.addEventListener?.('change', on)
        return () => mq.removeEventListener?.('change', on)
    }, [])
    return narrow
}

export const layoutMap = (nodes = [], edges = []) => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const cols = COLUMNS.map((kind) => nodes.filter((n) => n.kind === kind)).filter((c) => c.length)
    const colOf = new Map()
    cols.forEach((c, ci) => c.forEach((n) => colOf.set(n.id, ci)))
    const rowOf = new Map()
    cols.forEach((c, ci) => {
        if (ci > 0) {
            const score = (n) => {
                const rows = edges
                    .map((e) => (e.from === n.id ? e.to : e.to === n.id ? e.from : null))
                    .filter((id) => id && colOf.get(id) < ci)
                    .map((id) => rowOf.get(id))
                return rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity
            }
            c.sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label))
        }
        c.forEach((n, i) => rowOf.set(n.id, i))
    })
    const pos = new Map()
    for (const n of nodes) {
        if (!colOf.has(n.id)) continue
        pos.set(n.id, { x: PAD + colOf.get(n.id) * COL_W, y: PAD + rowOf.get(n.id) * ROW_H })
    }
    const rowsMax = Math.max(1, ...cols.map((c) => c.length))
    return {
        pos,
        width: PAD * 2 + cols.length * COL_W - (COL_W - NODE_W),
        height: PAD * 2 + rowsMax * ROW_H - (ROW_H - NODE_H),
        edges: edges.filter((e) => pos.has(e.from) && pos.has(e.to) && byId.has(e.from) && byId.has(e.to))
    }
}

const clip = (text, n = 18) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)

export default function MonitorMap({ map, selectedId, onPick, narrow }) {
    const nodes = useMemo(() => map?.nodes || [], [map])
    const edges = useMemo(() => map?.edges || [], [map])
    const graph = useMemo(() => layoutMap(nodes, edges), [nodes, edges])
    if (!nodes.length) return <div className="monitor-note">Nothing on the map yet. Machines, tiers and spaces appear when the server reports them.</div>

    if (narrow) {
        return (
            <div className="monitor-map-list" data-monitor-map="list">
                {COLUMNS.map((kind) => {
                    const group = nodes.filter((n) => n.kind === kind)
                    if (!group.length) return null
                    return (
                        <div key={kind} className="monitor-group">
                            <div className="monitor-group-title">{KIND_TITLE[kind]} <span className="preferences-tree-tag">{group.length}</span></div>
                            <div className="monitor-grid">
                                {group.map((n) => (
                                    <button key={n.id} type="button" data-map-node={n.id}
                                        className={`monitor-row tone-${STATE_TONE[n.state] || 'muted'}${selectedId === n.id ? ' is-selected' : ''}`}
                                        aria-pressed={selectedId === n.id} onClick={() => onPick(n)}>
                                        <span className="monitor-name">{n.label}</span>
                                        <span className="monitor-meta">{n.state}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="monitor-map" data-monitor-map="graph">
            <svg viewBox={`0 0 ${graph.width} ${graph.height}`} role="group" aria-label="Map of machines, tiers, spaces and shows"
                style={{ width: '100%', minWidth: '40rem', height: 'auto', aspectRatio: `${graph.width} / ${graph.height}` }}>
                <g className="monitor-map-edges">
                    {graph.edges.map((e, i) => {
                        const a = graph.pos.get(e.from)
                        const b = graph.pos.get(e.to)
                        const x1 = a.x + NODE_W
                        const x2 = b.x
                        const flip = x2 < a.x
                        const ax = flip ? a.x : x1
                        const bx = flip ? b.x + NODE_W : x2
                        const mx = (ax + bx) / 2
                        const y1 = a.y + NODE_H / 2
                        const y2 = b.y + NODE_H / 2
                        const touch = selectedId && (e.from === selectedId || e.to === selectedId)
                        return <path key={`${e.from}>${e.to}>${i}`} d={`M${ax},${y1} C${mx},${y1} ${mx},${y2} ${bx},${y2}`}
                            className={`monitor-edge kind-${e.kind}${touch ? ' is-lit' : ''}`} />
                    })}
                </g>
                {nodes.filter((n) => graph.pos.has(n.id)).map((n) => {
                    const p = graph.pos.get(n.id)
                    const sel = selectedId === n.id
                    return (
                        <g key={n.id} transform={`translate(${p.x},${p.y})`} data-map-node={n.id} role="button" tabIndex={0}
                            aria-pressed={sel} aria-label={`${n.kind} ${n.label}, ${n.state}`}
                            className={`monitor-node tone-${STATE_TONE[n.state] || 'muted'}${sel ? ' is-selected' : ''}`}
                            onClick={() => onPick(n)}
                            onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(n) } }}>
                            <rect width={NODE_W} height={NODE_H} className="monitor-node-box" />
                            <rect width="3" height={NODE_H} className="monitor-node-edge" />
                            <text x="11" y={NODE_H / 2 + 4} className="monitor-node-label">{clip(n.label)}</text>
                            <title>{`${n.kind}: ${n.label} (${n.state})`}</title>
                        </g>
                    )
                })}
            </svg>
            <div className="monitor-map-key">
                {COLUMNS.filter((k) => nodes.some((n) => n.kind === k)).map((k) => <span key={k}>{KIND_TITLE[k]}</span>)}
            </div>
        </div>
    )
}
