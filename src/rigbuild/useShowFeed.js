import { useCallback, useEffect, useState } from 'react'
import { ShowError, fetchShow } from './showApi.js'

// ONE READER OF THE SHOW for every surface that lists the cues (the show page, the room's cue
// list): GET /api/spaces/:space/show/:project once a second while the tab is visible and
// `enabled`. The server's clock minus ours comes from the round trip's midpoint, so countdowns
// read the server's time. `error` is set when a poll fails; `data` keeps the last good answer,
// so a dropped link shows as "stale" and never as an empty list.
export const SHOW_POLL_MS = 1000

export function useShowFeed(spaceId, projectId, { enabled = true } = {}) {
    const [data, setData] = useState(null)
    const [error, setError] = useState(null) // { status, message }

    const take = useCallback((body, t0, t1) => {
        if (!body) return
        const offset = Number.isFinite(body.now) ? body.now - (t0 + t1) / 2 : 0
        setData({ ...body, receivedAt: t1, offset })
        setError(null)
    }, [])

    useEffect(() => {
        if (!enabled || !spaceId || !projectId) return undefined
        let gone = false
        let controller = null
        const tick = async () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
            controller?.abort()
            controller = new AbortController()
            const t0 = Date.now()
            try {
                const body = await fetchShow(spaceId, projectId, { signal: controller.signal })
                if (!gone) take(body, t0, Date.now())
            } catch (e) {
                if (gone || e?.name === 'AbortError') return
                setError({ status: e instanceof ShowError ? e.status : 0, message: e instanceof ShowError ? e.message : 'The server does not answer. Trying again…' })
            }
        }
        tick()
        const timer = setInterval(tick, SHOW_POLL_MS)
        const onVisible = () => { if (document.visibilityState === 'visible') tick() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { gone = true; clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', onVisible) }
    }, [spaceId, projectId, enabled, take])

    return { data, error, take }
}
