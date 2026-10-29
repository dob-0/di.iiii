import { Component, forwardRef, lazy, Suspense, useState } from 'react'
import { Box } from '@mui/material'
import { useCodeCommit } from './codeBuffer.js'

// The code window's editor is CodeMirror 6 (UX audit F018, slice S18): line numbers, colours, find,
// Tab indents. It loads on first use, so only a code project pays for it. The plain text box
// below is what it replaces and it stays: it shows while the editor loads, takes over if the editor
// cannot load, and is a choice the person can make ("Plain text box") — nothing is lost.
const CodeMirrorBox = lazy(() => import('./CodeMirrorBox.jsx'))
const PLAIN_KEY = 'di.codeEditor.plain'

const readPlain = () => {
    try { return window.localStorage.getItem(PLAIN_KEY) === '1' } catch { return false }
}
const writePlain = (on) => {
    try { window.localStorage.setItem(PLAIN_KEY, on ? '1' : '0') } catch { /* private mode: the choice lasts this visit only */ }
}

// The plain text box. The code buffer is local while you type (see codeBuffer.js); the box scrolls
// itself instead of growing, so an autosizing field never re-measures a whole file per keystroke.
const PlainCodeArea = forwardRef(function PlainCodeArea({ value, onCommit, label }, ref) {
    const [draft, setDraft] = useState(value)
    const { flush, change } = useCodeCommit(value, onCommit, setDraft)
    return (
        <Box
            component="textarea"
            ref={ref}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); change(event.target.value) }}
            onBlur={flush}
            spellCheck={false}
            aria-label={label}
            sx={{
                flex: 1,
                width: '100%',
                minHeight: 220,
                resize: 'vertical',
                boxSizing: 'border-box',
                p: 1,
                fontFamily: 'var(--di-mono)',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                color: 'text.primary',
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 0,
                outline: 'none',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                overflow: 'auto',
                '&:focus': { borderColor: 'primary.main' }
            }}
        />
    )
})

// If the editor's code fails to load (offline, a stale deploy), fall back to the plain box.
class EditorBoundary extends Component {
    state = { failed: false }
    static getDerivedStateFromError() { return { failed: true } }
    render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export const CodeEditorArea = forwardRef(function CodeEditorArea({ value, onCommit, fileName }, ref) {
    const [plain, setPlain] = useState(readPlain)
    const label = fileName ? `Code of ${fileName}` : 'Code'
    const box = <PlainCodeArea ref={ref} value={value} onCommit={onCommit} label={label} />
    const choose = (on) => { writePlain(on); setPlain(on) }
    return (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {plain ? box : (
                <EditorBoundary fallback={box}>
                    <Suspense fallback={box}>
                        <CodeMirrorBox ref={ref} value={value} onCommit={onCommit} fileName={fileName} label={label} />
                    </Suspense>
                </EditorBoundary>
            )}
            <Box
                component="button"
                type="button"
                onClick={() => choose(!plain)}
                sx={{ alignSelf: 'flex-end', mt: 0.5, p: 0, border: 0, background: 'none', color: 'text.secondary', font: 'inherit', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer' }}
            >
                {plain ? 'Use the code editor' : 'Use a plain text box'}
            </Box>
        </Box>
    )
})
