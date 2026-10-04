import { useCallback, useState } from 'react'
import { OUTPUT_STORAGE_KEY, outputModeWanted } from './outputMode.js'

// Output mode for this viewer (outputMode.js): [on, setOn]. Lite unless the address or
// this browser's own choice says Full — decided before the first frame, from nothing a
// server has to answer, so the renderer is never swapped under a room already compiling.
const readStored = () => {
    try { return window.localStorage.getItem(OUTPUT_STORAGE_KEY) } catch { return null }
}

export default function useOutputMode() {
    const [stored, setStored] = useState(() => (typeof window === 'undefined' ? null : readStored()))
    const on = outputModeWanted({ search: typeof window === 'undefined' ? '' : window.location.search, stored })
    const setOn = useCallback((next) => {
        const value = next ? 'lite' : 'full'
        try { window.localStorage.setItem(OUTPUT_STORAGE_KEY, value) } catch { /* private window */ }
        setStored(value)
    }, [])
    return [on, setOn]
}
