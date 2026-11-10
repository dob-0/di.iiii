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
    const alive = useRef(true)
    const readRef = useRef(read)
    useEffect(() => { readRef.current = read })
    const refresh = useCallback(async () => {
        const next = await readRef.current({ spaceId }).catch(() => ({ state: 'off', looks: [], liveId: null, master: null, blackout: false }))
        if (alive.current) setReading(next)
        return next
    }, [spaceId])
    useEffect(() => {
        alive.current = true
        if (!enabled) { setReading(null); return undefined }
        let timer = 0
        const tick = async () => {
            if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await refresh()
            if (alive.current) timer = setTimeout(tick, pollMs)
        }
        tick()
        return () => { alive.current = false; clearTimeout(timer) }
    }, [enabled, refresh, pollMs])
    return { reading, refresh }
}
