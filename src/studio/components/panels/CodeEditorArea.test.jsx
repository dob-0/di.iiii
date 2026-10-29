import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { EditorView } from '@codemirror/view'
import { CodeEditorArea } from './CodeEditorArea.jsx'

// UX audit F018 (slice S18): the code window's box was a bare textarea with no name, no line
// numbers, no colours, no find and no indenting. These fail on that box.
afterEach(() => { window.localStorage.clear(); vi.useRealTimers() })

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
})
