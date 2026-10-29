import { forwardRef, useEffect, useRef, useState } from 'react'
import { Box } from '@mui/material'

// The code buffer is local while you type: a whole-page file re-issues a document
// op per keystroke otherwise, and an autosizing field re-measures the entire file
// on every one. The box scrolls itself instead of growing; edits land on idle, on
// blur, and on unmount (switching files or closing the window keeps them).
export const CodeEditorArea = forwardRef(function CodeEditorArea({ value, onCommit }, ref) {
    const [draft, setDraft] = useState(value)
    const committedRef = useRef(value)
    const pendingRef = useRef(null)
    const timerRef = useRef(null)
    const commitRef = useRef(onCommit)
    useEffect(() => { commitRef.current = onCommit })

    // adopt changes that came from anywhere but this box (asset insert, undo, sync)
    useEffect(() => {
        if (value === committedRef.current) return
        committedRef.current = value
        pendingRef.current = null
        setDraft(value)
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

    const handleChange = (event) => {
        const next = event.target.value
        setDraft(next)
        pendingRef.current = next
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(flush, 400)
    }

    return (
        <Box
            component="textarea"
            ref={ref}
            value={draft}
            onChange={handleChange}
            onBlur={flush}
            spellCheck={false}
            sx={{
                flex: 1,
                width: '100%',
                minHeight: 220,
                resize: 'vertical',
                boxSizing: 'border-box',
                p: 1,
                fontFamily: 'monospace',
                fontSize: '0.76rem',
                lineHeight: 1.5,
                color: 'text.primary',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                outline: 'none',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                overflow: 'auto',
                '&:focus': { borderColor: 'primary.main' }
            }}
        />
    )
})
