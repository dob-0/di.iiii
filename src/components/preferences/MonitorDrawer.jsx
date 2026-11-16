import { InfoPair, formatTimestamp } from './PreferencesShared.jsx'
import { timeAgo, formatBytes, ago } from './monitorFormat.js'
import { Sparkline } from './MonitorOverview.jsx'
import { shortCommit, tierLabel, tierState } from './monitorTier.js'
import { vitalDetail } from './monitorCalm.js'

// The drawer: the detail of one thing, opened by an action or a click. Right side on a desk, a bottom
// sheet on the phone. A vital chip opens its list here; a row of that list opens its own detail.

export const drawerTitle = (selected, row, snap) => {
    if (!selected) return ''
    if (selected.kind === 'vital') return vitalDetail(snap, selected.id).title
    if (!row) return ''
    if (selected.kind === 'tier') return tierLabel(row.id)
    return row.name || row.label || row.title || row.unit || row.target || `#${row.number}`
}

function TierDetail({ row, snap, history }) {
    const rows = snap?.tiers?.rows || []
    const dev = rows.find((r) => r.id === 'dev')
    const spaces = (snap?.spaces?.rows || []).filter((s) => s.tier === row.id).length
    const state = tierState(row, dev?.commit)
    return (
        <>
            <InfoPair label="State" value={state.note} />
            {row.commit ? <InfoPair label="Commit" value={shortCommit(row.commit)} mono /> : null}
            {dev && row.id !== 'dev' ? <InfoPair label="Dev commit" value={shortCommit(dev.commit)} mono /> : null}
            {row.builtAt ? <InfoPair label="Built" value={`${formatTimestamp(row.builtAt)} (${ago(row.builtAt)})`} /> : null}
            {dev && row.id !== 'dev' && dev.builtAt ? <InfoPair label="Dev built" value={`${formatTimestamp(dev.builtAt)} (${ago(dev.builtAt)})`} /> : null}
            {row.id !== 'dev' ? <InfoPair label="Behind dev" value={typeof row.behindDev === 'number' ? `${row.behindDev} ${row.behindDev === 1 ? 'commit' : 'commits'}` : 'unknown'} mono /> : null}
            {row.url ? <InfoPair label="Address" value={row.url} mono /> : null}
            {row.source !== 'self' && row.source !== 'report' ? <InfoPair label="Answer" value={`${row.status ?? '—'}${typeof row.ms === 'number' ? ` · ${row.ms} ms` : ''}`} mono /> : null}
            {snap?.spaces?.ok === false ? null : <InfoPair label="Spaces" value={`${spaces}${row.source === 'self' ? '' : ' public'}`} mono />}
            <Sparkline values={history?.[row.id]} />
        </>
    )
}

export default function MonitorDrawer({ selected, row, snap, history, onClose, onPick }) {
    const kind = selected.kind
    const title = drawerTitle(selected, row, snap)
    const detail = kind === 'vital' ? vitalDetail(snap, selected.id) : null
    return (
        <aside className="monitor-inspector monitor-drawer" aria-label="Inspector">
            <div className="monitor-drawer-head">
                <div className="preferences-stage-sidebar-title">{`Inspector${title ? ` — ${title}` : ''}`}</div>
                <button type="button" className="preferences-inline-action monitor-drawer-close" aria-label="Close inspector" onClick={onClose}>×</button>
            </div>
            {!row ? <div className="preferences-empty">That one is not in the latest snapshot.</div> : null}
            {detail && row ? (
                <>
                    <div className="monitor-dots" aria-hidden="true">
                        {detail.dots.slice(0, 120).map((d, i) => <i key={i} className={`monitor-dot tone-${d.tone}`} title={d.title} />)}
                    </div>
                    <div className="monitor-drawer-list">
                        {detail.rows.map((r) => (
                            <button key={r.key} type="button" data-vital-row={r.key} className={`monitor-row tone-${r.tone}`} onClick={() => onPick(r.kind, r.row)}>
                                <span className="monitor-name">{r.name}</span>
                                <span className="monitor-meta">{r.meta}</span>
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
            {kind === 'tier' && row ? <TierDetail row={row} snap={snap} history={history} /> : null}
            {kind === 'machine' && row ? (
                <>
                    <InfoPair label="State" value={row.online ? 'online' : 'offline'} mono />
                    <InfoPair label="System" value={row.os || 'n/a'} mono />
                    <InfoPair label="Address" value={row.ip || 'n/a'} mono />
                    <InfoPair label="Last seen" value={row.online ? 'now' : formatTimestamp(row.lastSeen)} />
                    <InfoPair label="Sent / received" value={`${formatBytes(row.tx)} / ${formatBytes(row.rx)}`} mono />
                </>
            ) : null}
            {kind === 'probe' && row ? (
                <>
                    <InfoPair label="Address" value={row.url} mono />
                    <InfoPair label="Answer" value={row.status ? String(row.status) : 'no answer'} mono />
                    <InfoPair label="Time" value={`${row.ms} ms`} mono />
                    {row.error ? <InfoPair label="Error" value={row.error} mono /> : null}
                </>
            ) : null}
            {kind === 'agent' && row ? (
                <>
                    <InfoPair label="Account" value={row.account} mono />
                    <InfoPair label="Status" value={`${row.status} (${row.kind})`} mono />
                    {row.branch && row.branch !== 'HEAD' ? <InfoPair label="Branch" value={row.branch} mono /> : null}
                    <InfoPair label="Checkout" value={row.cwd || 'n/a'} mono />
                    <InfoPair label="Model" value={row.model || 'n/a'} mono />
                    <InfoPair label="Last activity" value={formatTimestamp(row.lastActivity)} />
                    <InfoPair label="Session" value={row.sessionId} mono />
                </>
            ) : null}
            {kind === 'thing' && row ? (
                <>
                    <InfoPair label="Thing" value={row.title} />
                    <InfoPair label="State" value={row.state} mono />
                    <InfoPair label="Detail" value={row.detail} />
                </>
            ) : null}
            {kind === 'place' && row ? (
                <>
                    <InfoPair label={row.kind} value={row.target} mono />
                    <InfoPair label="Connected" value={String(row.people.length)} />
                    {row.people.map((p, i) => <InfoPair key={`${p.name}-${i}`} label={p.name} value={`since ${timeAgo(p.since)}`} />)}
                </>
            ) : null}
            {kind === 'service' && row ? (
                <>
                    <InfoPair label="Unit" value={row.unit} mono />
                    <InfoPair label="State" value={`${row.active} · ${row.sub}`} mono />
                    <InfoPair label="What" value={row.description || 'n/a'} />
                </>
            ) : null}
            {kind === 'node' && row ? (
                <>
                    <InfoPair label={row.kind} value={row.label} />
                    <InfoPair label="State" value={row.state} mono />
                    {row.tiers?.length ? <InfoPair label="On" value={row.tiers.join(' · ')} mono /> : null}
                    <InfoPair label="Id" value={row.id} mono />
                    {(snap?.map?.edges || []).filter((e) => row.rawIds?.includes(e.from) || row.rawIds?.includes(e.to)).reduce((acc, e) => {
                        const otherId = row.rawIds.includes(e.from) ? e.to : e.from
                        const other = (snap.map.nodes || []).find((n) => n.id === otherId)
                        const text = other?.label || otherId
                        if (!acc.some((x) => x.kind === e.kind && x.text === text)) acc.push({ kind: e.kind, text })
                        return acc
                    }, []).map((x, i) => <InfoPair key={`${x.kind}-${x.text}-${i}`} label={x.kind} value={x.text} />)}
                </>
            ) : null}
            {kind === 'pr' && row ? (
                <>
                    <InfoPair label="Number" value={`#${row.number}`} mono />
                    <InfoPair label="Branch" value={row.branch} mono />
                    <InfoPair label="State" value={row.draft ? 'draft' : 'open'} mono />
                    <InfoPair label="Updated" value={formatTimestamp(row.updatedAt)} />
                    <a className="preferences-inline-action" href={row.url} target="_blank" rel="noreferrer">Open on GitHub</a>
                </>
            ) : null}
        </aside>
    )
}
