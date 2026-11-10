import { useCallback, useEffect, useRef, useState } from 'react'
import { readLaserDesk, readLaserEngine } from '../map/laserLink.js'

// Gentle read of the laser engine + desk for the Perform windows: GET only,
// every 2 s, paused while the tab is hidden. Nothing here writes.
export const LASER_POLL_MS = 2000

export default function useLaser({ pollMs = LASER_POLL_MS } = {}) {
    const [reading, setReading] = useState({ engine: null, desk: null })
    const alive = useRef(true)
    const refresh = useCallback(async () => {
        const [engine, desk] = await Promise.all([readLaserEngine().catch(() => ({ reachable: false })), readLaserDesk().catch(() => ({ reachable: false }))])
        if (alive.current) setReading({ engine, desk })
        return { engine, desk }
    }, [])
    useEffect(() => {
        alive.current = true
        let timer = 0
        const tick = async () => {
            if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await refresh()
            if (alive.current) timer = setTimeout(tick, pollMs)
        }
        tick()
        return () => { alive.current = false; clearTimeout(timer) }
    }, [refresh, pollMs])
    return { ...reading, refresh, known: reading.engine !== null }
}
