import { useEffect, useRef, useState } from 'react'

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const defaultRequestFrame = (callback) => (typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 16))
const defaultCancelFrame = (handle) => (typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame(handle)
    : clearTimeout(handle))

// TouchDesigner-style card viewers read a live value every frame in
// TouchDesigner itself; a card here shares the page with the room, the
// palette and every other card, so this batches reads onto rAF and throttles
// them to `intervalMs` (build task 1: "update at <=10Hz with rAF batching")
// instead of each viewer running its own setInterval. The loop runs only
// while the component that calls this hook is mounted — a card scrolled
// below the port tier unmounts its viewer, and the loop stops with it, the
// same rule cardPreview's scheduler follows for the picture below the ports.
const DEFAULT_INTERVAL_MS = 100

export function useLiveOutput(read, {
    intervalMs = DEFAULT_INTERVAL_MS,
    now = defaultNow,
    requestFrame = defaultRequestFrame,
    cancelFrame = defaultCancelFrame
} = {}) {
    const readRef = useRef(read)
    // Kept current in an effect, not during render — a ref mutated while
    // rendering is a React footgun even though the value only ever feeds an
    // event/interval callback (see DmxOutPanelWindow.jsx's fetchRef for the
    // same idiom elsewhere in this codebase).
    useEffect(() => { readRef.current = read })
    const [value, setValue] = useState(() => readRef.current())
    const valueRef = useRef(value)

    useEffect(() => {
        let frame = null
        let lastAt = -Infinity
        let stopped = false
        const tick = () => {
            if (stopped) return
            const t = now()
            if (t - lastAt >= intervalMs) {
                lastAt = t
                const next = readRef.current()
                if (!Object.is(next, valueRef.current)) {
                    valueRef.current = next
                    setValue(next)
                }
            }
            frame = requestFrame(tick)
        }
        frame = requestFrame(tick)
        return () => {
            stopped = true
            if (frame !== null) cancelFrame(frame)
        }
    }, [intervalMs, now, requestFrame, cancelFrame])

    return value
}
