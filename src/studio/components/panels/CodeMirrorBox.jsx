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
        if (!view || view.state.doc.toString() === next) return
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
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
                    syntaxHighlighting(houseHighlight),
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
        setSelectionRange: (anchor, head) => viewRef.current?.dispatch({ selection: { anchor, head }, scrollIntoView: true })
    }), [])

    return <div ref={hostRef} className="di-code-editor" data-testid="code-editor" />
})
