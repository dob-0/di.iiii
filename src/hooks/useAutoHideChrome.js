import { useCallback, useEffect, useRef, useState } from 'react'

// Fullscreen and the disappearing header.
//
// Worth being precise about what fullscreen is for here: it does nothing for
// VR. Once "Enter VR" starts a WebXR session the headset owns the display and
// the browser window is irrelevant. Fullscreen is for the FLAT-screen case —
// a laptop or a projector at an exhibition, where a URL bar and a tab strip
// sit around a white tunnel and wreck it.
//
// The header hides on idle for the same reason: the piece's rule is that there
// is nothing to operate, so any chrome that has to exist should get out of the
// way and come back on the first pointer move.

const IDLE_MS = 2600

const fullscreenElement = () =>
    document.fullscreenElement ?? document.webkitFullscreenElement ?? null

const requestFullscreen = (element) => {
    const request = element?.requestFullscreen ?? element?.webkitRequestFullscreen
    return request ? request.call(element) : Promise.reject(new Error('unsupported'))
}

const exitFullscreen = () => {
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen
    return exit ? exit.call(document) : Promise.reject(new Error('unsupported'))
}

// Typing a duration into the director panel must not toggle fullscreen on "f".
// Exported because every bare-letter shortcut in the piece needs the same
// guard — see usePanelToggle.js for "h".
export const isTypingInto = (target) => {
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * @param targetRef   element to make fullscreen (the piece's root, so the
 *                    canvas fills the screen rather than just the document)
 * @param autoHide    false while the director panel is open — the author is
 *                    working and controls vanishing under the cursor is
 *                    infuriating
 */
export const useAutoHideChrome = ({ targetRef, autoHide = true } = {}) => {
    const [chromeVisible, setChromeVisible] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isSupported, setIsSupported] = useState(false)
    const timerRef = useRef(0)

    useEffect(() => {
        setIsSupported(
            typeof document !== 'undefined'
            && Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled)
        )
    }, [])

    useEffect(() => {
        if (typeof document === 'undefined') return undefined
        const sync = () => setIsFullscreen(Boolean(fullscreenElement()))
        sync()
        document.addEventListener('fullscreenchange', sync)
        document.addEventListener('webkitfullscreenchange', sync)
        return () => {
            document.removeEventListener('fullscreenchange', sync)
            document.removeEventListener('webkitfullscreenchange', sync)
        }
    }, [])

    const toggleFullscreen = useCallback(() => {
        const element = targetRef?.current
        if (!element) return
        const promise = fullscreenElement() ? exitFullscreen() : requestFullscreen(element)
        // A rejected request (denied, or no user gesture) is not worth an alert
        // in a piece with no interface — the button simply does nothing.
        promise?.catch?.(() => {})
    }, [targetRef])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined

        if (!autoHide) {
            window.clearTimeout(timerRef.current)
            setChromeVisible(true)
            return undefined
        }

        const wake = () => {
            setChromeVisible(true)
            window.clearTimeout(timerRef.current)
            timerRef.current = window.setTimeout(() => setChromeVisible(false), IDLE_MS)
        }

        wake()
        window.addEventListener('pointermove', wake)
        window.addEventListener('pointerdown', wake)
        window.addEventListener('keydown', wake)

        return () => {
            window.clearTimeout(timerRef.current)
            window.removeEventListener('pointermove', wake)
            window.removeEventListener('pointerdown', wake)
            window.removeEventListener('keydown', wake)
        }
    }, [autoHide])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const onKey = (event) => {
            if (event.key !== 'f' && event.key !== 'F') return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            if (isTypingInto(event.target)) return
            event.preventDefault()
            toggleFullscreen()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [toggleFullscreen])

    return { chromeVisible, isFullscreen, isFullscreenSupported: isSupported, toggleFullscreen }
}

export default useAutoHideChrome
