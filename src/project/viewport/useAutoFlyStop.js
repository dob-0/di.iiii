import { useEffect, useRef } from 'react'

export const AUTO_FLY_STOP_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart']

/**
 * While `active`, the visitor's first input of any kind (pointer, wheel, key, touch) calls `onStop` — the flight ends
 * where it is and the camera goes back to them. A target inside [data-autofly] (the toggle button) is left to itself.
 */
export default function useAutoFlyStop(active, onStop) {
    const stopRef = useRef(onStop)
    useEffect(() => { stopRef.current = onStop }, [onStop])
    useEffect(() => {
        if (!active || typeof window === 'undefined') return undefined
        const handler = (event) => {
            if (event.target?.closest?.('[data-autofly]')) return
            stopRef.current?.()
        }
        AUTO_FLY_STOP_EVENTS.forEach((type) => window.addEventListener(type, handler, { capture: true, passive: true }))
        return () => AUTO_FLY_STOP_EVENTS.forEach((type) => window.removeEventListener(type, handler, { capture: true }))
    }, [active])
}
