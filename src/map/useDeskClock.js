import { useEffect } from 'react'
import { followShowClock, setDeskTempo } from './deskBeat.js'

// A page that plays the mapping (the desk, /out) keeps the desk's beat: the
// mapping's own tempo, or the bar show's while its engine is up. `out` is
// /out, which draws ahead of now like the show's projection windows.
export default function useDeskClock(tempo, { out = false } = {}) {
    const bpm = tempo?.bpm
    const zero = tempo?.zero
    useEffect(() => {
        setDeskTempo(Number.isFinite(bpm) ? { bpm, zero: Number.isFinite(zero) ? zero : 0 } : null)
    }, [bpm, zero])
    useEffect(() => followShowClock({ out }), [out])
}
