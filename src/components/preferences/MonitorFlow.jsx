import { perMinute } from './monitorFlow.js'
import { Sparkline } from './MonitorOverview.jsx'

// The Flow panel: the real stream, as it arrives (time, source, what changed), the events per minute, and when each source was last heard.
const clock = (t) => new Date(t).toLocaleTimeString([], { hour12: false })
const ago = (t, now) => { if (!t) return 'never'; const s = Math.max(0, Math.floor((now - t) / 1000)); return s < 90 ? `${s}s ago` : `${Math.round(s / 60)}m ago` }

export default function MonitorFlow({ log, rates, nowMs, paused, onPause }) {
    const newest = [...log].reverse().slice(0, 30)
    const per = perMinute(log, nowMs, 15)
    const hosts = Object.entries(rates).sort((a, b) => (b[1].lastAt || 0) - (a[1].lastAt || 0))
    return (
        <div className="mp-flow" data-box="flow">
            <div className="mp-flow-head">
                <span className="mp-flow-title">Events per minute, last 15</span>
                <button type="button" className="mp-btn" aria-pressed={paused} onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>
            </div>
            <div className="mp-flow-spark"><Sparkline values={per} /></div>
            <h4 className="mp-flow-h">Last heard</h4>
            <ul className="mp-flow-list" data-flow="sources">
                {hosts.length ? hosts.map(([host, r]) => (
                    <li key={host} className={r.silent ? 'is-silent' : ''}><span>{host}</span><span className="mp-tm">{r.silent ? 'silent · ' : ''}{r.perMin}/min · {ago(r.lastAt, nowMs)}</span></li>
                )) : <li className="mp-tm">No machine has reported yet.</li>}
            </ul>
            <h4 className="mp-flow-h">Incoming</h4>
            <ul className="mp-flow-list" data-flow="stream">
                {newest.length ? newest.map((e, i) => (
                    <li key={`${e.t}-${i}`} className={`tone-${e.tone}`}><span className="mp-tm">{clock(e.t)}</span><span>{e.text}</span></li>
                )) : <li className="mp-tm">Nothing has changed since this page opened.</li>}
            </ul>
        </div>
    )
}
