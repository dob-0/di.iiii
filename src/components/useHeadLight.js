import { useCallback, useEffect, useState } from 'react'
import { isTypingTarget } from './walkKeyboard.js'
import { isHeadLightKey, toggleHeadLight } from './headLight.js'

/**
 * The visitor's own head light state: always off at first, never saved. The F key
 * (while the project makes the light available and nobody is typing) and the
 * on-screen button both go through `toggle`. Leaving walk mode switches it off,
 * so the next walk starts dark again.
 *
 * @param {boolean} available the project asked for a head light AND the visitor is walking
 * @returns {{ on: boolean, toggle: () => void }}
 */
export function useHeadLight(available) {
    const [on, setOn] = useState(false)
    const toggle = useCallback(() => setOn((value) => toggleHeadLight(value, available)), [available])

    useEffect(() => {
        if (!available) {
            setOn(false)
            return undefined
        }
        const onKey = (event) => {
            if (isHeadLightKey(event, isTypingTarget(event.target))) toggle()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [available, toggle])

    return { on: available && on, toggle }
}
