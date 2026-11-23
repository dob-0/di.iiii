import { useCallback, useEffect, useRef, useState } from 'react'

// One slider, one request in flight. A drag fires a change per pixel; sending
// each one floods the desk and lets replies land out of order. Here the first
// change goes at once, every change while it is in flight only replaces the
// ONE waiting value, and when the reply is back the latest waiting value goes
// last (trailing). The thumb shows the local value while a hand is on it
// (`local`), never what a reply or a poll says, so it cannot snap back.
// `release()` hands the thumb back to the polled value once nothing is queued.
export default function useSliderSend(send) {
    const [local, setLocal] = useState(null)
    const sendRef = useRef(send)
    useEffect(() => { sendRef.current = send })
    const state = useRef({ busy: false, has: false, value: null, released: false, mounted: true })
    useEffect(() => {
        const s = state.current
        s.mounted = true
        return () => { s.mounted = false }
    }, [])

    const push = useCallback((value) => {
        const s = state.current
        setLocal(value)
        s.value = value
        s.has = true
        s.released = false
        if (s.busy) return
        s.busy = true
        ;(async () => {
            while (s.has) {
                const next = s.value
                s.has = false
                try { await sendRef.current(next) } catch { /* the caller's send names its own failure */ }
            }
            s.busy = false
            if (s.released && s.mounted) setLocal(null)
        })()
    }, [])

    const release = useCallback(() => {
        const s = state.current
        if (s.busy || s.has) { s.released = true; return }
        setLocal(null)
    }, [])

    return { local, push, release }
}
