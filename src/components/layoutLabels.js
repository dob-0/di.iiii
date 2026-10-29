// The letters on the visitor's own keys. `navigator.keyboard.getLayoutMap()` (Chromium) says what the key at a place types in
// the visitor's layout; a browser without it keeps the Latin words (W A S D), as before. The walk itself reads the place
// (physicalKey.js), so only the hint words change.
import { useEffect, useState } from 'react'

/** The label of the key at `code` ('KeyW'): the layout's own letter upper-cased, else `fallback`. Pure. */
export const layoutLabel = (map, code, fallback) => {
    const text = map && typeof map.get === 'function' ? map.get(code) : null
    return typeof text === 'string' && text.length === 1 ? text.toUpperCase() : fallback
}

/** The layout map, or null until known / where the browser cannot tell. */
export function useLayoutMap() {
    const [map, setMap] = useState(null)
    useEffect(() => {
        let live = true
        const keyboard = typeof navigator !== 'undefined' ? navigator.keyboard : null
        if (!keyboard || typeof keyboard.getLayoutMap !== 'function') return undefined
        keyboard.getLayoutMap().then((m) => { if (live) setMap(m) }).catch(() => {})
        return () => { live = false }
    }, [])
    return map
}

/** "WASD" in the visitor's own letters ("ZQSD" on AZERTY). */
export const moveKeysText = (map) => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map((c) => layoutLabel(map, c, c.slice(3))).join('')
