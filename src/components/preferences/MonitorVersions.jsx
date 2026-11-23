import { buildMachines, buildPartVersions, filterVersions, worksTone, WORKS_TEXT } from './monitorVersions.js'

// Versions: the latest and the past of everything the Monitor watches. Top: what each machine runs against
// dev. Below: one card per part with its working state, the version it runs, and its past versions (merged
// pull requests that touched it, newest first). "seen working" marks the last version whose own probe
// answered while it ran: the rollback target is one look. Unknown stays "unknown".
const PR_URL = 'https://github.com/dob-0/di.iiii/pull/'

function History({ part }) {
    if (!part.history.length) return <p className="monitor-note monitor-version-empty">No past versions recorded for this install (packed without git history).</p>
    return (
        <ol className="monitor-version-list">
            {part.history.map((h) => (
                <li key={h.commit} className={`monitor-version-item${h.running ? ' is-running' : ''}${h.proven ? ' is-proven' : ''}`} data-version={h.short}>
                    <span className="monitor-version-date">{h.date || 'unknown'}</span>
                    <code className="monitor-version-hash">{h.short || 'unknown'}</code>
                    <span className="monitor-version-title" title={h.title}>{h.title || 'no title'}</span>
                    <span className="monitor-version-marks">
                        {h.pr ? <a href={`${PR_URL}${h.pr}`} target="_blank" rel="noopener noreferrer" aria-label={`Pull request ${h.pr}`}>#{h.pr}</a> : null}
                        {h.running ? <b className="monitor-mark is-running">running</b> : null}
                        {h.proven ? <b className="monitor-mark is-proven">seen working</b> : null}
                    </span>
                </li>
            ))}
        </ol>
    )
}

export default function MonitorVersions({ snap, query = '' }) {
    const machines = filterVersions(buildMachines(snap), query, (m) => `${m.name} ${m.short || ''} ${m.note}`)
    const parts = filterVersions(buildPartVersions(snap), query, (p) => `${p.name} ${p.id} ${p.works} ${p.short || ''} ${p.history.map((h) => `${h.title} ${h.short} ${h.pr || ''}`).join(' ')}`)
    const packed = snap?.parts?.packedAt ? String(snap.parts.packedAt).slice(0, 10) : null
    if (!machines.length && !parts.length) {
        return <p className="monitor-note" data-versions-empty="">{query ? `No version matches “${query}”.` : 'No versions reported yet. This server may be older than the Versions view.'}</p>
    }
    return (
        <div className="monitor-versions" data-monitor-versions="">
            {machines.length ? (
                <section aria-label="What each machine runs" className="monitor-versions-machines">
                    <h3 className="monitor-group-title">Running now, against dev</h3>
                    <div className="monitor-grid monitor-grid-machines">
                        {machines.map((m) => (
                            <div key={m.id} className={`monitor-row monitor-machine-version tone-${m.tone}`} data-machine-version={m.id} data-tone={m.tone}>
                                <span className="monitor-name">{m.name}</span>
                                <span className="monitor-meta"><code>{m.short || 'commit unknown'}</code>{m.built ? ` · built ${m.built}` : ''}</span>
                                <span className="monitor-meta">{m.note}</span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
            {parts.length ? (
                <section aria-label="Versions of each part" className="monitor-versions-parts">
                    <h3 className="monitor-group-title">Each part, latest and past{packed ? ` · this install packed ${packed}` : ''}</h3>
                    <div className="monitor-versions-grid">
                        {parts.map((p) => (
                            <article key={p.id} className={`monitor-version-card tone-${worksTone(p.works)}`} data-part-versions={p.id} data-works={p.works}>
                                <header className="monitor-version-head">
                                    <span className="monitor-name">{p.name}</span>
                                    <span className={`monitor-works tone-${worksTone(p.works)}`}>{WORKS_TEXT[p.works] || 'unknown'}</span>
                                </header>
                                <p className="monitor-meta">
                                    {p.short ? <>latest <code>{p.short}</code> · changed {p.date || 'unknown'}</> : 'latest version unknown (not stamped)'}
                                    {p.detail ? ` · ${p.detail}` : ''}
                                </p>
                                {p.proven ? (
                                    <p className="monitor-meta" data-proven={p.proven.commit}>
                                        last seen working <code>{p.proven.commit.slice(0, 9)}</code>{p.proven.date ? ` · changed ${p.proven.date}` : ''}
                                        {p.provenOutside ? ' · older than the list below' : ''}
                                    </p>
                                ) : <p className="monitor-meta">{p.works === 'unknown' ? 'no live probe: never seen working here' : 'not yet seen working on this machine'}</p>}
                                <History part={p} />
                            </article>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    )
}
