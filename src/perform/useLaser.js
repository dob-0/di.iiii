import { useCallback, useEffect, useRef, useState } from 'react'
import { readLaserDesk, readLaserEngine } from '../map/laserLink.js'

// Gentle read of the laser engine + desk for the Perform windows: GET only,
// every 2 s, paused while the tab is hidden. Nothing here writes.
export const LASER_POLL_MS = 2000

export default function useLaser({ pollMs = LASER_POLL_MS } = {}) {
    const [reading, setReading] = useState({ engine: null, desk: null })
    const mounted = useRef(true)
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const fetchReading = useCallback(async () => {
        const [engine, desk] = await Promise.all([readLaserEngine().catch(() => ({ reachable: false })), readLaserDesk().catch(() => ({ reachable: false }))])
        return { engine, desk }
    }, [])
    const refresh = useCallback(async () => {
        const next = await fetchReading()
        if (mounted.current) setReading(next)
        return next
    }, [fetchReading])
    // The loop owns its own `cancelled` (see useLightLooks): no shared flag between effect runs.
    useEffect(() => {
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
    }, [fetchReading, pollMs])
    return { ...reading, refresh, known: reading.engine !== null }
}
