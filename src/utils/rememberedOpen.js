import { useCallback, useState } from 'react'

// THE SCENE IS THE PAGE: every panel starts closed, one small control opens it, and what a viewer opens is remembered
// for that viewer only (this browser's localStorage, always in try/catch: private windows and blocked storage throw).
// Rule: docs/ai/golden_rules.md "The scene is the page".
const PREFIX = 'di.panel.'

// A work tool may start open where the owner asked for it (the Studio's SCENES window, 2026-10-13 15:5x): `opened` is the
// first-visit state; only a viewer's change from it is stored ('1' opened, '0' folded).
export const readOpen = (key, opened = false) => {
    try {
        const stored = window.localStorage.getItem(PREFIX + key)
        return stored === null ? opened : stored === '1'
    } catch { return opened }
}
export const writeOpen = (key, open, opened = false) => {
    try {
        if (open === opened) window.localStorage.removeItem(PREFIX + key)
        else window.localStorage.setItem(PREFIX + key, open ? '1' : '0')
    } catch { /* storage blocked: the panel simply forgets */ }
}

/** [open, toggle, setOpen] for one panel; starts closed (or `opened`) unless this viewer changed it before. */
export default function useRememberedOpen(key, opened = false) {
    const [open, setOpenState] = useState(() => readOpen(key, opened))
    const setOpen = useCallback((next) => {
        setOpenState((was) => {
            const value = typeof next === 'function' ? next(was) : next
            writeOpen(key, value, opened)
            return value
        })
    }, [key, opened])
    const toggle = useCallback(() => setOpen((o) => !o), [setOpen])
    return [open, toggle, setOpen]
}
