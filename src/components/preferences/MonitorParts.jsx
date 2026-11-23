import { rowMatches } from './monitorDetail.js'
// Parts: one row per part of di.iiii (light desk, show desk, lasers, 3D Studio …). Live state comes from the
// server's Connected rows; the version is the last commit that touched the part, stamped when the install was
// PACKED, so every version says "packed <date>": it is the pack, not proof of the running code.
// A part with no live probe says so; it is never drawn as healthy.
const TONE = { live: 'success', ok: 'success', idle: 'muted', off: 'warning', unprobed: 'muted', unknown: 'muted' }
export const partTone = (state) => TONE[state] || 'muted'
export const shortHash = (commit) => (typeof commit === 'string' && /^[0-9a-f]{7,40}$/.test(commit) ? commit.slice(0, 9) : null)

export default function MonitorParts({ parts, onPick, selectedId = null, query = '' }) {
    const rows = (parts?.rows || []).filter((r) => rowMatches(query, r))
    if (!rows.length && query) return <p className="monitor-note">No part matches “{query}”.</p>
    if (!rows.length) return <p className="monitor-note" data-parts-empty="">No parts reported. This server may be older than the Parts list.</p>
    const packed = parts?.packedAt ? String(parts.packedAt).slice(0, 10) : null
    return (
        <div className="monitor-grid" data-monitor-parts="">
            {rows.map((p) => {
                const hash = shortHash(p.commit)
                return (
                    <button type="button" key={p.id} className={`monitor-row monitor-part tone-${partTone(p.state)}${selectedId === p.id ? ' is-selected' : ''}`} data-part={p.id} data-part-state={p.state}
                        aria-pressed={selectedId === p.id} onClick={() => onPick?.(p)}>
                        <span className="monitor-name">{p.name}</span>
                        <span className="monitor-meta">{p.state} · {p.detail}</span>
                        <span className="monitor-meta">
                            {hash ? `${hash} · changed ${p.date || 'unknown'} · packed ${packed || 'date unknown'}` : 'version unknown (not stamped)'}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
