import { useCallback, useEffect, useRef, useState } from 'react'
import { readLightLooks } from '../map/lightingLink.js'

// The Light desk's looks for the Light block: GET only, every 3 s, paused
// while the tab is hidden, and ASKED ONLY WHEN THE SHOW CLOCK SAYS THE DESK IS
// UP. Every Light route but the clock builds the desk (and its 40 Hz loop and
// Art-Net socket) on first touch (serverXR/src/routes/lightingRoutes.js), so a
// Perform page on a machine with no lights must never be what builds it.
export const LIGHT_POLL_MS = 3000

export default function useLightLooks({ spaceId, enabled, pollMs = LIGHT_POLL_MS, read = readLightLooks } = {}) {
    const [reading, setReading] = useState(null)
    const mounted = useRef(true)
    const readRef = useRef(read)
    useEffect(() => { readRef.current = read })
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const fetchReading = useCallback(
        () => readRef.current({ spaceId }).catch(() => ({ state: 'off', looks: [], liveId: null, master: null, blackout: false })),
        [spaceId]
    )
    // An explicit refresh (after a press) only needs the page to be mounted.
    const refresh = useCallback(async () => {
        const next = await fetchReading()
        if (mounted.current) setReading(next)
        return next
    }, [fetchReading])
    // The poll loop belongs to ITS effect run: a `cancelled` of its own, so a quick
    // off/on cannot leave the old loop alive beside the new one (2 loops = double polling).
    useEffect(() => {
        if (!enabled) { setReading(null); return undefined }
        let cancelled = false
        let timer = 0
        const tick = async () => {
            if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
                const next = await fetchReading()
                if (cancelled) return
                setReading(next)
            }
            if (!cancelled) timer = setTimeout(tick, pollMs)
        }
        tick()
        return () => { cancelled = true; clearTimeout(timer) }
    }, [enabled, fetchReading, pollMs])
    return { reading, refresh }
}
