// "live · heard 4 s ago" for one panel. The server says how old each panel's last read is; the page adds
// the time since it heard that. Amber at twice the panel's own interval, "old" far past it: a stale panel
// says so, it never sits there looking current.
export const PANEL_INTERVAL_MS = {
    machines: 5000, network: 5000, agents: 5000, presence: 5000, connected: 5000, services: 5000,
    pullRequests: 5000, tasks: 5000, shows: 5000, tiers: 10000, chats: 30000, parts: 5000
}
const OLD_FACTOR = 6

export const liveState = (ageMs, intervalMs) => {
    if (typeof ageMs !== 'number' || !Number.isFinite(ageMs)) return { state: 'waiting', label: 'waiting for the first read' }
    const s = Math.max(0, Math.round(ageMs / 1000))
    const when = s < 1 ? 'just now' : s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
    if (ageMs >= intervalMs * OLD_FACTOR) return { state: 'old', label: `old · heard ${when}` }
    if (ageMs >= intervalMs * 2) return { state: 'late', label: `late · heard ${when}` }
    return { state: 'live', label: `live · heard ${when}` }
}

export default function PanelLive({ name, ages, nowMs, paused = false }) {
    const a = ages?.[name]
    const age = a ? a.age + Math.max(0, nowMs - a.heard) : null
    const st = paused ? { state: 'paused', label: 'paused' } : liveState(age, PANEL_INTERVAL_MS[name] || 5000)
    return <span className={`monitor-panel-live is-${st.state}`} data-live-panel={name} data-live-state={st.state}><i aria-hidden="true" />{st.label}</span>
}
