import { useCallback, useState } from 'react'
import { MODE_LOCAL, resolveDeployMode } from '../../utils/deployMode.js'
import { OUTPUT_STORAGE_KEY, isSoftwareRenderer, outputModeWanted } from './outputMode.js'

// Output mode for this viewer (outputMode.js): [on, setOn]. The work machine is told by
// the address alone (loopback or LAN, deployMode.js), decided before the first frame: a
// later answer from /api/config would swap the renderer under a room already compiling.
// A phone (coarse pointer) and a software renderer get the output; a desktop with a real GPU starts in High (owner
// 2026-10-15). The renderer is read once per page from a throwaway WebGL context (WEBGL_debug_renderer_info, as
// measureReport.js reads it); when the probe fails the device is treated as a real GPU and the Low button is one tap away.
// The choice lives for THIS TAB (sessionStorage): every new visit starts in Low (owner 2026-10-08). Before, a High chosen
// once stayed in localStorage for good, and the room opened heavy ever after.
const readStored = () => {
    try { return window.sessionStorage.getItem(OUTPUT_STORAGE_KEY) } catch { return null }
}
const coarsePointer = () => {
    try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}
let softwareGlProbe = null
const softwareGl = () => {
    if (softwareGlProbe !== null) return softwareGlProbe
    try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl')
        const ext = ctx?.getExtension?.('WEBGL_debug_renderer_info')
        const renderer = ctx ? ctx.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : ctx.RENDERER) : ''
        softwareGlProbe = ctx ? isSoftwareRenderer(renderer) : true
        ctx?.getExtension?.('WEBGL_lose_context')?.loseContext?.()
    } catch { softwareGlProbe = false }
    return softwareGlProbe
}

export default function useOutputMode() {
    const [stored, setStored] = useState(() => (typeof window === 'undefined' ? null : readStored()))
    const looksLocal = typeof window !== 'undefined'
        && resolveDeployMode({ hostname: window.location.hostname }) === MODE_LOCAL
    const on = outputModeWanted({
        search: typeof window === 'undefined' ? '' : window.location.search,
        stored,
        coarse: typeof window !== 'undefined' && coarsePointer(),
        workMachine: looksLocal,
        softwareGl: typeof window !== 'undefined' && softwareGl()
    })
    const setOn = useCallback((next) => {
        const value = next ? 'low' : 'high'
        try { window.sessionStorage.setItem(OUTPUT_STORAGE_KEY, value) } catch { /* private window */ }
        setStored(value)
    }, [])
    return [on, setOn]
}
