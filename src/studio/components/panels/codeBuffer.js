import { useEffect, useRef } from 'react'

// The code buffer is local while you type: a whole-page file re-issues a document
// op per keystroke otherwise. Edits land on idle (400 ms), on blur, and on unmount
// (switching files or closing the window keeps them). Both the code editor and the
// plain text box commit through this one path (onCommit), so they never differ.
export function useCodeCommit(value, onCommit, onAdopt) {
    const committedRef = useRef(value)
    const pendingRef = useRef(null)
    const timerRef = useRef(null)
    const commitRef = useRef(onCommit)
    const adoptRef = useRef(onAdopt)
    useEffect(() => { commitRef.current = onCommit; adoptRef.current = onAdopt })

    // adopt changes that came from anywhere but this box (asset insert, undo, sync)
    useEffect(() => {
        if (value === committedRef.current) return
        committedRef.current = value
        pendingRef.current = null
        adoptRef.current?.(value)
    }, [value])

    const flush = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        const next = pendingRef.current
        pendingRef.current = null
        if (next === null || next === committedRef.current) return
        committedRef.current = next
        commitRef.current?.(next)
    }

    useEffect(() => flush, [])

    const change = (next) => {
        pendingRef.current = next
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flush, 400)
    }

    return { flush, change }
}
