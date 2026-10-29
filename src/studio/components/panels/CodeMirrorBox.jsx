import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, temporarilySetTabFocusMode } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { useCodeCommit } from './codeBuffer.js'
import '../../styles/studio-code.css'

// The studio is dark: without this the library draws a black caret, a light find bar and a light selection.
const darkSurface = EditorView.theme({}, { dark: true })

// Colours for the dark studio surface (the library's default style is made for white paper).
const houseHighlight = HighlightStyle.define([
    { tag: [t.keyword, t.operatorKeyword, t.controlKeyword], color: '#ff9ecb' },
    { tag: [t.string, t.special(t.string)], color: '#a8e08a' },
    { tag: [t.number, t.bool, t.null], color: '#ffc26b' },
    { tag: [t.comment, t.lineComment, t.blockComment], color: '#8a97a6', fontStyle: 'italic' },
    { tag: [t.tagName, t.typeName, t.className], color: '#6fd3ff' },
    { tag: [t.attributeName, t.propertyName], color: '#c9b6ff' },
    { tag: [t.function(t.variableName), t.definition(t.variableName)], color: '#ffe38a' },
    { tag: [t.angleBracket, t.punctuation, t.bracket], color: '#b7c2cf' }
])

function languageFor(name = '') {
    const ext = name.split('.').pop().toLowerCase()
    if (ext === 'html' || ext === 'htm') return html()
    if (ext === 'css') return css()
    if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json'].includes(ext)) return javascript({ jsx: ext.endsWith('x'), typescript: ext.startsWith('ts') })
    return []
}

// CodeMirror 6 (MIT) as the code window's editor: line numbers, colours, find (Ctrl/Cmd-F),
// Tab indents, Esc then Tab leaves it (WCAG 2.1.1). The handle it gives FilesPanel looks like
// a textarea (value, selectionStart/End, setSelectionRange, focus) so "insert at the cursor" is unchanged.
export default forwardRef(function CodeMirrorBox({ value, onCommit, fileName, label }, ref) {
    const hostRef = useRef(null)
    const viewRef = useRef(null)
    const { flush, change } = useCodeCommit(value, onCommit, (next) => {
        const view = viewRef.current
        if (!view) return
        // replace only the part that differs, so the cursor and the lines around stay where they were
        const doc = view.state.doc.toString()
        if (doc === next) return
        let from = 0
        while (from < doc.length && from < next.length && doc[from] === next[from]) from++
        let end = 0
        while (end < doc.length - from && end < next.length - from && doc[doc.length - 1 - end] === next[next.length - 1 - end]) end++
        view.dispatch({ changes: { from, to: doc.length - end, insert: next.slice(from, next.length - end) } })
    })
    const flushRef = useRef(flush)
    const changeRef = useRef(change)
    useEffect(() => { flushRef.current = flush; changeRef.current = change })

    useEffect(() => {
        const view = new EditorView({
            parent: hostRef.current,
            state: EditorState.create({
                doc: value,
                extensions: [
                    lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), drawSelection(),
                    history(), indentOnInput(), bracketMatching(), highlightSelectionMatches(),
                    darkSurface, syntaxHighlighting(houseHighlight),
                    languageFor(fileName),
                    keymap.of([
                        { key: 'Escape', run: temporarilySetTabFocusMode },
                        indentWithTab,
                        ...searchKeymap, ...historyKeymap, ...defaultKeymap
                    ]),
                    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', spellcheck: 'false' }),
                    EditorView.updateListener.of((u) => { if (u.docChanged) changeRef.current(u.state.doc.toString()) }),
                    EditorView.domEventHandlers({ blur: () => { flushRef.current() } })
                ]
            })
        })
        viewRef.current = view
        return () => { view.destroy(); viewRef.current = null }
        // one editor per file (FilesPanel keys on the file name); value changes arrive through the adopt path
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useImperativeHandle(ref, () => ({
        get value() { return viewRef.current?.state.doc.toString() ?? '' },
        get selectionStart() { return viewRef.current?.state.selection.main.from ?? 0 },
        get selectionEnd() { return viewRef.current?.state.selection.main.to ?? 0 },
        focus: () => viewRef.current?.focus(),
        // clamp like a textarea does: the new text may not have reached the editor yet
        setSelectionRange: (anchor, head) => {
            const view = viewRef.current
            if (!view) return
            const len = view.state.doc.length
            view.dispatch({ selection: { anchor: Math.min(anchor, len), head: Math.min(head ?? anchor, len) }, scrollIntoView: true })
        }
    }), [])

    return <div ref={hostRef} className="di-code-editor" data-testid="code-editor" />
})
