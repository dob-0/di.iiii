import { useEffect, useRef } from 'react'
import { DEFAULT_TILT_RANGE, needsOrientationPermission, screenAngle, tiltFromOrientation } from '../utils/tiltReading.js'

// The graph's sense of how the phone is tipped — no window, one per Tilt node
// (the KeyboardFeed shape). On iOS the browser gives no reading until the
// person answers a prompt, and Safari only opens that prompt from inside a
// tap, so the feed waits for the first tap anywhere on the page and asks
// there, synchronously in the handler (an await before the ask loses the
// gesture). Elsewhere it listens straight away. Readings are published at
// most once per animation frame: a phone fires ~60 a second and each one
// re-renders the editor.
export default function TiltFeed({ node, range = DEFAULT_TILT_RANGE, onTilt }) {
    // A new Range applies to the next reading without re-asking or re-levelling.
    const rangeRef = useRef(range)
    useEffect(() => {
        rangeRef.current = range
    }, [range])

    useEffect(() => {
        let rest = null
        let latest = null
        let frame = 0
        let listening = false
        const flush = () => {
            frame = 0
            if (!latest || !rest) return
            const reading = tiltFromOrientation(latest, rest, { range: rangeRef.current, angle: screenAngle(window) })
            if (reading) onTilt?.(node.id, { ...reading, live: true })
        }
        const onOrientation = (event) => {
            // Desktops fire one event with nulls: no sensor, not a level phone.
            if (event.beta == null || event.gamma == null) return
            latest = { beta: event.beta, gamma: event.gamma }
            if (!rest) rest = latest
            if (!frame) frame = window.requestAnimationFrame(flush)
        }
        // A turned screen is a new way of holding it: level starts again.
        const onTurn = () => {
            rest = null
        }
        const listen = () => {
            if (listening) return
            listening = true
            window.addEventListener('deviceorientation', onOrientation)
            window.addEventListener('orientationchange', onTurn)
        }

        onTilt?.(node.id, { x: 0, y: 0, live: false })
        const gestureEvents = ['touchend', 'click']
        const askOnTap = () => {
            for (const name of gestureEvents) window.removeEventListener(name, askOnTap, true)
            let answer
            try {
                answer = window.DeviceOrientationEvent.requestPermission()
            } catch {
                return
            }
            Promise.resolve(answer).then((state) => {
                if (state === 'granted') listen()
            }, () => {})
        }
        if (typeof window.DeviceOrientationEvent === 'undefined') {
            // No sensor API at all: stays level and not live.
        } else if (needsOrientationPermission(window)) {
            for (const name of gestureEvents) window.addEventListener(name, askOnTap, true)
        } else {
            listen()
        }

        return () => {
            for (const name of gestureEvents) window.removeEventListener(name, askOnTap, true)
            window.removeEventListener('deviceorientation', onOrientation)
            window.removeEventListener('orientationchange', onTurn)
            if (frame) window.cancelAnimationFrame(frame)
            onTilt?.(node.id, null)
        }
    }, [node.id, onTilt])

    return null
}
