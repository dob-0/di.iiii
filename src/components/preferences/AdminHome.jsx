import { useEffect, useMemo, useState } from 'react'
import { Hint } from './PreferencesShared.jsx'
import { NeedsYou } from './MonitorVital.jsx'
import MonitorActivity from './MonitorActivity.jsx'
import { needsYou, seedActivity } from './monitorCalm.js'

// The desk home: the whole desk, not a corner of it. Top: what needs him (the calm Monitor's rows, read-only;
// a button opens the Monitor window) or "All well". Then the tiles, in a grid that fills the width and the
// height that is left. Beside them, Activity (the calm Monitor's). A person without the Monitor gets the tiles only.

function Tile({ kind, tile, onOpen }) {
    const tone = tile?.tone || 'default'
    return (
        <div className={`admin-tile tone-${tone}`}>
            <button type="button" className="admin-tile-open" onClick={() => onOpen(kind.key)} aria-label={`${kind.label}: ${tile?.value ?? '—'} ${tile?.word || ''}`.trim()}>
                <span className="admin-tile-band" aria-hidden="true" />
                <span className="admin-tile-name">{kind.label}</span>
                <span className="admin-tile-value">{tile?.value ?? '—'}</span>
                <span className="admin-tile-word">{tile?.word || ''}</span>
            </button>
            <span className="admin-tile-hint"><Hint text={kind.hint} label={`About ${kind.label}`} /></span>
        </div>
    )
}

export default function AdminHome({ top, hidden, groups, tiles, monitorAllowed, monitor, onOpen }) {
    const { snap, error, at } = monitor
    const [nowMs, setNowMs] = useState(() => Date.now())
    useEffect(() => {
        if (!monitorAllowed) return undefined
        const timer = setInterval(() => setNowMs(Date.now()), 10000)
        return () => clearInterval(timer)
    }, [monitorAllowed])
    const needs = useMemo(() => (snap ? needsYou(snap) : []), [snap])
    const earlier = useMemo(() => (snap ? seedActivity(snap, nowMs, 24) : []), [snap]) // eslint-disable-line react-hooks/exhaustive-deps
    const checked = at ? `checked ${Math.max(0, Math.floor((nowMs - at) / 1000))} s ago` : 'checking'
    const showMonitor = monitorAllowed
    return (
        <div className={`admin-home${showMonitor ? ' has-monitor' : ''}`} style={{ top }} data-testid="admin-desk" hidden={hidden}>
            {showMonitor ? (
                <div className="admin-home-needs">
                    <NeedsYou rows={needs} loaded={!!snap} paused={false} error={error && !snap} checked={checked} onOpen={() => onOpen('monitor')} />
                </div>
            ) : null}
            <div className="admin-home-tiles">
                {groups.filter((group) => group.kinds.length).map((group) => (
                    <section key={group.key} className="admin-group" aria-label={group.label} style={{ flexGrow: Math.max(1, Math.ceil(group.kinds.length / 6)) }}>
                        <h2 className="admin-group-title">{group.label}</h2>
                        <div className="admin-tiles">
                            {group.kinds.map((kind) => <Tile key={kind.key} kind={kind} tile={tiles[kind.key]} onOpen={onOpen} />)}
                        </div>
                    </section>
                ))}
            </div>
            {showMonitor && snap ? (
                <div className="admin-home-activity">
                    <MonitorActivity feed={[]} earlier={earlier} />
                </div>
            ) : null}
        </div>
    )
}

