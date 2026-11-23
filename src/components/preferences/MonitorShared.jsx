import { ago } from './monitorFormat.js'

// Shared: ONE picture from the dev server, the same on every machine (machines and the version each reports, pull
// requests, spaces, shows, asks, tasks). It is read by this machine's server with the stored login, so no GitHub login is
// needed here. The Board, Map and Work tabs stay about THIS machine. When dev does not answer, the last good picture stays,
// marked old with its time; with none yet it says so.
const STATE_TEXT = {
    ok: (s) => `Shared picture from dev, read ${ago(s.at)}.`,
    offline: (s) => `Dev is not answering${s.lastGoodAt ? `: showing the last good picture from ${ago(s.lastGoodAt)}` : ' and no picture was read yet'}.`,
    'signed-out': () => 'Not signed in: run di login to see the shared picture from dev. The other tabs show this machine.',
    expired: (s) => `Your sign-in ended${s.lastGoodAt ? ` (last picture ${ago(s.lastGoodAt)})` : ''}: run di login again.`,
    refused: () => 'This account may not read the shared picture (owner only). The other tabs show this machine.'
}
const short = (commit) => (typeof commit === 'string' && commit ? commit.slice(0, 7) : 'unknown')
const match = (q, ...parts) => !q.trim() || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase())

function Box({ id, title, count, children }) {
    return (
        <section className="monitor-shared-box" data-shared-box={id} aria-label={title}>
            <h3 className="monitor-group-title">{title} <span className="preferences-tree-tag">{count}</span></h3>
            {count ? <div className="monitor-grid">{children}</div> : <p className="monitor-note">Nothing reported.</p>}
        </section>
    )
}

export default function MonitorShared({ shared, query = '' }) {
    const state = shared?.state
    const data = shared?.data
    const note = state && STATE_TEXT[state] ? STATE_TEXT[state](shared) : null
    if (!shared) return <p className="monitor-note" data-shared-state="none">The shared picture is read by a local Monitor from dev; this server has none.</p>
    const old = state !== 'ok'
    const machines = (data?.machines || []).filter((m) => match(query, m.host, m.commit))
    const prs = (data?.pullRequests?.rows || []).filter((p) => match(query, p.title, p.branch, `#${p.number}`))
    const spaces = (data?.spaces?.rows || []).filter((s) => match(query, s.slug, s.tier))
    const shows = (data?.shows || []).filter((s) => match(query, s.title, s.id, s.machine))
    const asks = (data?.asks?.rows || []).filter((a) => match(query, a.text, a.id))
    const tasks = (data?.tasks || []).filter((t) => match(query, t.title, t.id, t.machine))
    return (
        <div className={`monitor-shared${old ? ' is-old' : ''}`} data-monitor-shared="" data-shared-state={state}>
            {note ? <div className={`monitor-note${state === 'ok' ? '' : ' is-down'}`} data-shared-note={state}>{note}</div> : null}
            {data ? (
                <div className="monitor-shared-grid">
                    <Box id="machines" title="Machines and versions" count={machines.length}>
                        {machines.map((m) => (
                            <div key={m.host} className={`monitor-row tone-${m.stale ? 'muted' : 'success'}`} data-shared-machine={m.host}>
                                <span className="monitor-name">{m.host}</span>
                                <span className="monitor-meta"><code>{short(m.commit)}</code> · {m.stale ? 'quiet' : 'reporting'} · {ago(m.reportedAt)}</span>
                            </div>
                        ))}
                    </Box>
                    <Box id="prs" title={`Pull requests${data.pullRequests?.from ? ` (via ${data.pullRequests.from})` : ''}`} count={prs.length}>
                        {prs.map((p) => (
                            <div key={p.number} className={`monitor-row tone-${p.draft ? 'muted' : 'accent'}`} data-shared-pr={p.number}>
                                <span className="monitor-name">#{p.number} {p.title}</span>
                                <span className="monitor-meta">{p.draft ? 'draft' : 'open'}{p.updatedAt ? ` · ${ago(p.updatedAt)}` : ''}</span>
                            </div>
                        ))}
                    </Box>
                    <Box id="spaces" title="Spaces" count={spaces.length}>
                        {spaces.map((s) => (
                            <div key={`${s.tier}/${s.slug}`} className="monitor-row" data-shared-space={`${s.tier}/${s.slug}`}>
                                <span className="monitor-name">{s.slug}</span>
                                <span className="monitor-meta">{s.tier} · {s.visibility}</span>
                            </div>
                        ))}
                    </Box>
                    <Box id="shows" title="Shows" count={shows.length}>
                        {shows.map((s, i) => (
                            <div key={`${s.machine}/${s.id || i}`} className="monitor-row" data-shared-show={s.id || i}>
                                <span className="monitor-name">{s.title || s.id}</span>
                                <span className="monitor-meta">{s.machine}</span>
                            </div>
                        ))}
                    </Box>
                    <Box id="asks" title="Asks" count={asks.length}>
                        {asks.map((a) => (
                            <div key={a.id} className="monitor-row" data-shared-ask={a.id}>
                                <span className="monitor-name">{a.text}</span>
                                <span className="monitor-meta">{a.id} · {a.state}</span>
                            </div>
                        ))}
                    </Box>
                    <Box id="tasks" title="Tasks" count={tasks.length}>
                        {tasks.map((t, i) => (
                            <div key={`${t.machine}/${t.id || i}`} className="monitor-row" data-shared-task={t.id || i}>
                                <span className="monitor-name">{t.title || t.id}</span>
                                <span className="monitor-meta">{t.machine}</span>
                            </div>
                        ))}
                    </Box>
                </div>
            ) : null}
        </div>
    )
}
