import { useCallback, useState } from 'react'
import { RENDER_STORAGE_KEY, roomRenderWanted } from '../../shared/renderPlan.js'

// The room page's render (src/shared/renderPlan.js): ['tech' | 'show', set]. `?render=` in the address wins, then this
// tab's own choice (sessionStorage, like Quality), else Show — the public link is the showcase (decision
// 2026-10-15-studio-tech-show-render.md).
const readStored = () => {
    try { return window.sessionStorage.getItem(RENDER_STORAGE_KEY) } catch { return null }
}

export default function useRenderMode() {
    const [stored, setStored] = useState(() => (typeof window === 'undefined' ? null : readStored()))
    // a choice made here beats the address it arrived with, so a tap on Show in a ?render=tech tab sticks
    const search = typeof window === 'undefined' || stored ? '' : window.location.search
    const mode = roomRenderWanted({ search, stored })
    const setMode = useCallback((next) => {
        const value = next === 'tech' ? 'tech' : 'show'
        try { window.sessionStorage.setItem(RENDER_STORAGE_KEY, value) } catch { /* private window */ }
        setStored(value)
    }, [])
    return [mode, setMode]
}
