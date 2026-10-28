import { useCallback, useEffect, useRef, useState } from 'react'
import { readSyncStatus } from './syncApi.js'

// How often the light asks while it is on, while the invite is open (the host
// is waiting to see the other machine arrive), and when the answer was "not
// for you" — a visitor to a hosted space, or an install that shares nothing.
const EVERY_MS = 5000
const EVERY_FAST_MS = 2000
const EVERY_IF_NOT_ALLOWED_MS = 10 * 60_000
const EVERY_IF_UNREACHABLE_MS = 30_000

/**
 * The sync status of one space, kept fresh. `now` is the SERVER's clock
 * advanced by the time since its answer arrived, so a browser whose clock is
 * wrong still counts "2 MIN" from the server's own times.
 */
export default function useSyncStatus(space, { fast = false } = {}) {
    const [state, setState] = useState({ status: null, fetchedAt: 0 })
    // This browser's clock, as of the last second the light turned it.
    const [clock, setClock] = useState(0)
    const fastRef = useRef(fast)
    const refreshRef = useRef(() => {})
    useEffect(() => { fastRef.current = fast }, [fast])

    useEffect(() => {
        setState({ status: null, fetchedAt: 0 })
        if (!space) return undefined
        let stopped = false
        let timer = null
        let controller = null
        const schedule = (ms) => { if (!stopped) timer = setTimeout(run, ms) }
        async function run() {
            clearTimeout(timer)
            if (typeof document !== 'undefined' && document.hidden) return schedule(EVERY_MS)
            controller = new AbortController()
            const result = await readSyncStatus(space, { signal: controller.signal })
            if (stopped) return undefined
            const at = Date.now()
            setClock(at)
            setState({ status: result.status, fetchedAt: at })
            if (result.status) return schedule(fastRef.current ? EVERY_FAST_MS : EVERY_MS)
            return schedule(result.retryable ? EVERY_IF_UNREACHABLE_MS : EVERY_IF_NOT_ALLOWED_MS)
        }
        refreshRef.current = () => { clearTimeout(timer); run() }
        // Not at the very first paint of a surface: it has other things to load.
        timer = setTimeout(run, 800)
        return () => { stopped = true; clearTimeout(timer); controller?.abort() }
    }, [space])

    // The words count seconds, so something has to turn the clock — but only
    // while there is a light to show.
    const shown = Boolean(state.status && (state.status.follows || state.status.followers?.length || state.status.code))
    useEffect(() => {
        if (!shown) return undefined
        const interval = setInterval(() => setClock(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [shown])

    const refresh = useCallback(() => refreshRef.current(), [])
    const now = state.status ? state.status.now + Math.max(0, clock - state.fetchedAt) : clock
    return { status: state.status, now, refresh }
}
