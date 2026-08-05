import { useEffect } from 'react'

// `html`, `body` and `#root` are all `position: fixed` (src/styles/base.css), so
// the document never scrolls and each long page owns its own scroller. The
// browser only drives a scroller that is FOCUSED, and a plain <main>/<div>
// cannot take focus — so Space, PageUp/Down, the arrows, Home and End are dead
// on every one of those pages. It reads as "scrolling is broken" only to
// someone using keys, because a wheel targets the scroller directly.
//
// Focusing the root on mount fixes it until the first click: pressing any
// button hands focus back to BODY, the unscrollable fixed element, and the keys
// die again. Anything keyed on where focus happens to be keeps finding a new
// way to be wrong, so the keys are handled outright.
export function useKeyboardPageScroll(scrollerRef, { enabled = true } = {}) {
    useEffect(() => {
        if (!enabled) return undefined
        const onKey = (event) => {
            const root = scrollerRef.current
            if (!root || event.metaKey || event.ctrlKey || event.altKey) return
            const el = document.activeElement
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
            // Space on a button is that button being pressed, not a page turn.
            // Left to the browser deliberately: preventDefault here stops the
            // press as well, and the browser does not scroll for it anyway.
            if (event.key === ' ' && el && (el.tagName === 'BUTTON' || el.tagName === 'A')) return
            const page = root.clientHeight * 0.9
            const step = {
                ' ': event.shiftKey ? -page : page,
                PageDown: page,
                PageUp: -page,
                ArrowDown: 64,
                ArrowUp: -64,
                End: root.scrollHeight,
                Home: -root.scrollHeight
            }[event.key]
            if (step === undefined) return
            event.preventDefault()
            root.scrollBy({ top: step, behavior: 'smooth' })
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [scrollerRef, enabled])
}
