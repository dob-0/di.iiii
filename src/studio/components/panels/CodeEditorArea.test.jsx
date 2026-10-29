import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EditorView } from '@codemirror/view'
import { CodeEditorArea } from './CodeEditorArea.jsx'

// UX audit F018 (slice S18): the code window's box was a bare textarea with no name, no line
// numbers, no colours, no find and no indenting. These fail on that box.
afterEach(() => { window.localStorage.clear(); vi.useRealTimers() })

// jsdom has no layout for a Range. CodeMirror measures text on an animation frame; when that frame
// runs inside a test (fake timers, or a slow full-suite run) it called these and threw (land batch review).
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => []
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => new DOMRect()

const loaded = async (props = {}) => {
    const ref = createRef()
    const onCommit = vi.fn()
    render(<CodeEditorArea ref={ref} value={'<p>hi</p>'} fileName="index.html" onCommit={onCommit} {...props} />)
    const content = await waitFor(() => {
        const el = document.querySelector('.cm-content')
        if (!el) throw new Error('editor not loaded yet')
        return el
    })
    return { ref, onCommit, content }
}

describe('CodeEditorArea (CodeMirror)', () => {
    it('has an accessible name, line numbers and a mono font host', async () => {
        const { content } = await loaded()
        expect(screen.getByRole('textbox', { name: 'Code of index.html' })).toBe(content)
        expect(document.querySelector('.cm-lineNumbers')).not.toBeNull()
    })

    it('Tab inserts an indent; Esc then Tab leaves the editor alone', async () => {
        const { content, ref } = await loaded({ value: '' })
        act(() => ref.current.focus())
        fireEvent.keyDown(content, { key: 'Tab', keyCode: 9 })
        expect(ref.current.value).toMatch(/^\s+$/)
        fireEvent.keyDown(content, { key: 'Escape', keyCode: 27 })
        const tab = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true })
        content.dispatchEvent(tab)
        expect(tab.defaultPrevented).toBe(false)
    })

    it('commits on the same path as the plain box: onCommit after the idle pause', async () => {
        const { content, ref, onCommit } = await loaded()
        vi.useFakeTimers()
        act(() => { ref.current.setSelectionRange(0, 0) })
        fireEvent.keyDown(content, { key: 'Tab', keyCode: 9 })
        expect(onCommit).not.toHaveBeenCalled()
        act(() => { vi.advanceTimersByTime(450) })
        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit.mock.calls[0][0]).toMatch(/<p>hi<\/p>$/)
    })

    it('looks like a textarea to "insert at the cursor"', async () => {
        const { ref } = await loaded()
        act(() => ref.current.setSelectionRange(3, 5))
        expect([ref.current.selectionStart, ref.current.selectionEnd, ref.current.value]).toEqual([3, 5, '<p>hi</p>'])
        // past the end is clamped, as a textarea does (an insert whose text has not arrived yet)
        act(() => ref.current.setSelectionRange(99, 99))
        expect([ref.current.selectionStart, ref.current.selectionEnd]).toEqual([9, 9])
    })

    it('keeps the plain text box as a choice, remembered', async () => {
        const { onCommit } = await loaded()
        fireEvent.click(screen.getByRole('button', { name: 'Use a plain text box' }))
        const box = screen.getByRole('textbox', { name: 'Code of index.html' })
        expect(box.tagName).toBe('TEXTAREA')
        expect(document.querySelector('.cm-content')).toBeNull()
        fireEvent.change(box, { target: { value: 'x' } })
        fireEvent.blur(box)
        expect(onCommit).toHaveBeenCalledWith('x')
        expect(window.localStorage.getItem('di.codeEditor.plain')).toBe('1')
        fireEvent.click(screen.getByRole('button', { name: 'Use the code editor' }))
        await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull())
    })

    it('is marked dark, so the caret, selection and find bar are drawn for the dark studio', async () => {
        const { content } = await loaded()
        expect(EditorView.findFromDOM(content).state.facet(EditorView.darkTheme)).toBe(true)
    })

    it('a change from outside keeps the cursor where it was', async () => {
        const ref = createRef()
        const { rerender } = render(<CodeEditorArea ref={ref} value={'abc\ndef'} fileName="a.js" onCommit={() => {}} />)
        await waitFor(() => { if (!document.querySelector('.cm-content')) throw new Error('not yet') })
        act(() => ref.current.setSelectionRange(6, 6))
        rerender(<CodeEditorArea ref={ref} value={'abc\ndefg'} fileName="a.js" onCommit={() => {}} />)
        expect(ref.current.value).toBe('abc\ndefg')
        expect(ref.current.selectionStart).toBe(6)
    })

    // Picture step (S18): a 680 KB file made the box as tall as the file, the find bar sat ~125,000 px
    // down and "Use a plain text box" was out of reach; the line numbers let sideways text show through.
    describe('box in a window (css)', () => {
        const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/studio-code.css'), 'utf8')
        const rule = (sel) => (css.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`)) || [])[1] || ''
        it('the editor has a height limit and scrolls inside', () => {
            // Round 2: a viewport cap (70vh) ignored the window's own height; the chain gives min-height:0 instead.
            expect(rule('.di-code-editor')).not.toMatch(/max-height/)
            expect(rule('.di-code-editor .cm-editor')).toMatch(/min-height:\s*0/)
            const studio = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/studio.css'), 'utf8')
            const mobile = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../styles/studio-mobile.css'), 'utf8')
            expect(mobile).toMatch(/\.smb-sheet\[data-sheet="files"\] \.smb-sheet-body\s*\{[^}]*flex-direction:\s*column/)
            expect(studio).toMatch(/\.sfp-shell\[data-window-key="files"\] \.sfp-content\s*\{[^}]*flex-direction:\s*column/)
            // Review: the column keeps its scroll, so the buttons and library list under the editor are never clipped.
            expect(mobile).not.toMatch(/\.smb-sheet\[data-sheet="files"\] \.smb-sheet-body\s*\{[^}]*overflow:\s*hidden/)
            expect(studio).not.toMatch(/\.sfp-shell\[data-window-key="files"\] \.sfp-content\s*\{[^}]*overflow:\s*hidden/)
            expect(rule('.di-code-editor .cm-editor .cm-scroller')).toMatch(/overflow:\s*auto/)
        })
        it('the gutter is opaque', () => {
            expect(rule('.di-code-editor .cm-editor .cm-gutters')).toMatch(/background:\s*var\(--di-bg\)/)
        })
    })
})
