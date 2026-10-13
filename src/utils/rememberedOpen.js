import { useCallback, useState } from 'react'

// THE SCENE IS THE PAGE: every panel starts closed, one small control opens it, and what a viewer opens is remembered
// for that viewer only (this browser's localStorage, always in try/catch: private windows and blocked storage throw).
// Rule: docs/ai/golden_rules.md "The scene is the page".
const PREFIX = 'di.panel.'

export const readOpen = (key) => {
    try { return window.localStorage.getItem(PREFIX + key) === '1' } catch { return false }
}
export const writeOpen = (key, open) => {
    try {
        if (open) window.localStorage.setItem(PREFIX + key, '1')
        else window.localStorage.removeItem(PREFIX + key)
    } catch { /* storage blocked: the panel simply forgets */ }
}

/** [open, toggle, setOpen] for one panel; starts closed unless this viewer opened it before. */
export default function useRememberedOpen(key) {
    const [open, setOpenState] = useState(() => readOpen(key))
    const setOpen = useCallback((next) => {
        setOpenState((was) => {
            const value = typeof next === 'function' ? next(was) : next
            writeOpen(key, value)
            return value
        })
    }, [key])
    const toggle = useCallback(() => setOpen((o) => !o), [setOpen])
    return [open, toggle, setOpen]
}
