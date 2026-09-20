import { useEffect } from 'react'

// An unattended screen — a projector output, a kiosk display — must survive
// the OS deciding nobody is watching. `navigator.wakeLock.request('screen')`
// asks the platform not to blank the display, but the lock is released the
// moment the tab is hidden (switched away from, minimised, the OS screen
// itself blanks), so "request once on mount" alone still lets the screen go
// dark after the first hide/show cycle. This re-requests on every
// `visibilitychange` back to visible.
//
// Denial and absence are both silent: kiosk rigs often disable sleep at the
// OS level anyway, and a browser without the API just runs unlocked, exactly
// as it did before this hook existed.
export default function useScreenWakeLock() {
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.wakeLock?.request || typeof window === 'undefined') return undefined
        let lock = null
        let disposed = false
        const acquire = () => {
            navigator.wakeLock.request('screen')
                .then((next) => {
                    if (disposed) next?.release?.().catch(() => {})
                    else lock = next
                })
                .catch(() => {})
        }
        acquire()
        const onVisibility = () => {
            if (window.document.visibilityState === 'visible') acquire()
        }
        window.document.addEventListener('visibilitychange', onVisibility)
        return () => {
            disposed = true
            window.document.removeEventListener('visibilitychange', onVisibility)
            lock?.release?.().catch(() => {})
        }
    }, [])
}
