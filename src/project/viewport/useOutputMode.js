import { useCallback, useState } from 'react'
import { MODE_LOCAL, resolveDeployMode } from '../../utils/deployMode.js'
import { OUTPUT_STORAGE_KEY, outputModeWanted } from './outputMode.js'

// Output mode for this viewer (outputMode.js): [on, setOn]. The work machine is told by
// the address alone (loopback or LAN, deployMode.js), decided before the first frame: a
// later answer from /api/config would swap the renderer under a room already compiling.
// A LAN phone still gets the output (coarse pointer); hosted addresses always do.
const readStored = () => {
    try { return window.localStorage.getItem(OUTPUT_STORAGE_KEY) } catch { return null }
}
const coarsePointer = () => {
    try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

export default function useOutputMode() {
    const [stored, setStored] = useState(() => (typeof window === 'undefined' ? null : readStored()))
    const looksLocal = typeof window !== 'undefined'
        && resolveDeployMode({ hostname: window.location.hostname }) === MODE_LOCAL
    const on = outputModeWanted({
        search: typeof window === 'undefined' ? '' : window.location.search,
        stored,
        coarse: typeof window !== 'undefined' && coarsePointer(),
        workMachine: looksLocal
    })
    const setOn = useCallback((next) => {
        const value = next ? 'lite' : 'full'
        try { window.localStorage.setItem(OUTPUT_STORAGE_KEY, value) } catch { /* private window */ }
        setStored(value)
    }, [])
    return [on, setOn]
}
