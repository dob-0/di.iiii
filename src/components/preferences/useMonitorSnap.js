import { useCallback, useEffect, useState } from 'react'
import { getMonitor } from '../../services/apiClient.js'

// One read of GET /api/monitor for the desk home and the knowledge windows (Rules, Hooks, Requests,
// helpers): now, then every 30 s while the page is visible. The Monitor window keeps its own live stream;
// this is the slow read, owner-only like the Monitor (nothing is asked until the server said 200).
const EVERY_MS = 30000

export default function useMonitorSnap({ enabled = false, everyMs = EVERY_MS } = {}) {
    const [state, setState] = useState({ snap: null, error: null, at: 0 })
    const [tick, setTick] = useState(0)
    useEffect(() => {
        if (!enabled) return undefined
        let alive = true
        const read = async () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            try {
                const snap = await getMonitor()
                if (alive) setState({ snap, error: null, at: Date.now() })
            } catch (error) {
                if (alive) setState((prev) => ({ ...prev, error: String(error?.message || 'unreachable') }))
            }
        }
        read()
        const timer = setInterval(read, everyMs)
        return () => { alive = false; clearInterval(timer) }
    }, [enabled, everyMs, tick])
    const refresh = useCallback(() => setTick((n) => n + 1), [])
    return { ...state, refresh }
}
