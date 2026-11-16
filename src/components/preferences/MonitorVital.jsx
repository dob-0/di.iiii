// The two things under the top bar: what needs him (one row each, one action) and the vital strip
// (one row of chips: state as a left band, a number, a plain label). A chip opens its list in the drawer.

const same = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id

export function NeedsYou({ rows, loaded, paused, error, checked, onOpen }) {
    if (!loaded) return <section className="monitor-needs tone-muted" data-box="needs" data-needs="loading" aria-live="polite"><div className="monitor-needs-calm">Reading the monitor…</div></section>
    if (error) return <section className="monitor-needs tone-warning" data-box="needs" data-needs="error" aria-live="polite"><div className="monitor-needs-calm">Cannot reach the server</div></section>
    if (paused) return <section className="monitor-needs tone-muted" data-box="needs" data-needs="paused" aria-live="polite"><div className="monitor-needs-calm">Paused</div></section>
    if (!rows.length) {
        return <section className="monitor-needs tone-success" data-box="needs" data-needs="calm" aria-live="polite"><div className="monitor-needs-calm">All well · {checked}</div></section>
    }
    return (
        <section className="monitor-needs" data-box="needs" data-needs="rows" aria-live="polite" aria-label="Needs you">
            <ul className="monitor-needs-list">
                {rows.map((r) => (
                    <li key={r.id} className={`monitor-need tone-${r.tone}`} data-need-id={r.id}>
                        <div className="monitor-need-text">
                            <div className="monitor-need-what">{r.what}</div>
                            <div className="monitor-need-why">{r.why}</div>
                        </div>
                        <button type="button" className="monitor-need-action" onClick={() => onOpen(r.target)}>{r.action}</button>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export function VitalStrip({ chips, flashing, selected, onPick }) {
    if (!chips.length) return null
    return (
        <div className="monitor-vital" data-box="vital" aria-label="Vital signs" role="group">
            {chips.map((c) => {
                const on = same(selected, c.target)
                const attr = c.tierId ? { 'data-tier-id': c.tierId, 'data-tier-tone': c.tone } : { 'data-count-id': c.id }
                return (
                    <button key={c.id} type="button" {...attr} data-vital-id={c.id} aria-pressed={on}
                        className={`monitor-chip tone-${c.tone}${on ? ' is-selected' : ''}${flashing?.has(c.tierId ? `t:${c.tierId}` : `k:${c.id}`) ? ' is-changed' : ''}`}
                        onClick={() => onPick(c.target)}>
                        <span className="monitor-chip-label">{c.label}</span>
                        <span className="monitor-chip-value">{c.value}</span>
                    </button>
                )
            })}
        </div>
    )
}
