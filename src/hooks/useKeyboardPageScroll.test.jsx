import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import { useKeyboardPageScroll } from './useKeyboardPageScroll.js'

// The scroller is a plain element in jsdom: it has no layout and no scrollBy,
// so both are supplied. What is asserted is the call the browser would make.
function Page({ children = null } = {}) {
    const ref = useRef(null)
    useKeyboardPageScroll(ref)
    return <main data-testid="root" ref={ref}>{children}</main>
}

const press = (key, init = {}) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}

let scrollBy

beforeEach(() => {
    cleanup()
    scrollBy = vi.fn()
})

const mount = (ui = <Page />) => {
    const view = render(ui)
    const root = view.getByTestId('root')
    root.scrollBy = scrollBy
    Object.defineProperty(root, 'clientHeight', { value: 1000, configurable: true })
    Object.defineProperty(root, 'scrollHeight', { value: 5000, configurable: true })
    return root
}

describe('the reading keys drive the page scroller', () => {
    it.each([
        [' ', {}, 900],
        [' ', { shiftKey: true }, -900],
        ['PageDown', {}, 900],
        ['PageUp', {}, -900],
        ['ArrowDown', {}, 64],
        ['ArrowUp', {}, -64],
        ['End', {}, 5000],
        ['Home', {}, -5000]
    ])('%s scrolls the root', (key, init, top) => {
        mount()
        press(key, init)
        expect(scrollBy).toHaveBeenCalledWith({ top, behavior: 'smooth' })
    })

    // The bug this exists for: focus lands on BODY after the first click, and a
    // fix that only focused the root on mount died right there.
    it('still scrolls when focus has gone back to the body', () => {
        mount()
        document.body.focus()
        expect(document.activeElement).toBe(document.body)
        press('PageDown')
        expect(scrollBy).toHaveBeenCalledTimes(1)
    })

    it('leaves typing alone', () => {
        const root = mount(<Page><input data-testid="field" /></Page>)
        root.querySelector('input').focus()
        press(' ')
        press('ArrowDown')
        expect(scrollBy).not.toHaveBeenCalled()
    })

    it('leaves Space on a button to the browser, so the press still happens', () => {
        const root = mount(<Page><button type="button">go</button></Page>)
        root.querySelector('button').focus()
        press(' ')
        expect(scrollBy).not.toHaveBeenCalled()
        press('PageDown')
        expect(scrollBy).toHaveBeenCalledTimes(1)
    })

    it('leaves browser shortcuts alone', () => {
        mount()
        press('ArrowDown', { metaKey: true })
        press('Home', { ctrlKey: true })
        expect(scrollBy).not.toHaveBeenCalled()
    })

    it('unbinds on unmount', () => {
        mount()
        cleanup()
        press('PageDown')
        expect(scrollBy).not.toHaveBeenCalled()
    })
})
