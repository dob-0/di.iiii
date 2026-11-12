import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck } from '../../../project/tops/vjDeck.js'

// Round 4 of the deck's panes in the rendered deck: fold, one-border reset, lock, K2, the hint.
// jsdom has no layout: the deck box is mocked, as in VjDeckView.resize.test.jsx.
const KEY = 'di.vjDeck.layout'
let box
let observers

const stored = () => { try { return JSON.parse(window.localStorage.getItem(KEY)) } catch { return null } }
const root = () => document.querySelector('.vj-deck')
const seam = (id) => document.querySelector(`.vj-deck-seam[data-seam="${id}"]`)
const seamIds = () => [...document.querySelectorAll('.vj-deck-seam')].map((element) => element.getAttribute('data-seam')).sort()
const fold = (name) => screen.getByRole('button', { name: `${name} panel` })
const resizeTo = (width) => {
    box = { width, height: box.height }
    act(() => { observers.forEach((callback) => callback([])) })
}
const click = (element) => act(() => { fireEvent.click(element) })
const press = (element, key) => act(() => { fireEvent.keyDown(element, { key }) })
const withLayout = (value) => window.localStorage.setItem(KEY, JSON.stringify({ v: 1, ...value }))

function mount() {
    const onPatchValues = vi.fn()
    render(<VjDeckView node={{ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } }} onPatchValues={onPatchValues} />)
    return onPatchValues
}

beforeEach(() => {
    vi.useFakeTimers()
    box = { width: 1706, height: 838 }
    observers = []
    try { window.localStorage.clear() } catch { /* none */ }
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => box.width)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => box.height)
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { observers.push(callback) } observe() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('G2: the width band that had no border', () => {
    it('at 683 px the bottom row is stacked and no border exists; at 684 all of s4, s5, s6 exist', () => {
        mount()
        resizeTo(683)
        expect(seamIds()).toEqual([])
        resizeTo(600)
        expect(seamIds()).toEqual([])
        resizeTo(684)
        expect(seamIds()).toEqual(['s4', 's5', 's6'])
    })
})

describe('G3: fold', () => {
    it('each bottom panel has a real button with aria-expanded and a title in plain words', () => {
        mount()
        for (const [id, name] of [['sources', 'Sources'], ['clip', 'Clip'], ['effects', 'Effects']]) {
            const button = fold(name)
            expect(button.tagName).toBe('BUTTON')
            expect(button.getAttribute('type')).toBe('button')
            expect(button.getAttribute('aria-expanded')).toBe('true')
            expect(button.getAttribute('title')).toBe(`Fold the ${name} panel to a narrow strip`)
            expect(id).toBeTruthy()
        }
    })

    it('a click folds a panel to a rail with its name, stores it per viewer, and unfolds again', () => {
        const onPatchValues = mount()
        expect(root().getAttribute('data-fold')).toBeNull()
        click(fold('Sources'))
        expect(fold('Sources').getAttribute('aria-expanded')).toBe('false')
        expect(fold('Sources').getAttribute('title')).toBe('Unfold the Sources panel')
        expect(fold('Sources').textContent).toContain('Sources')
        expect(root().getAttribute('data-fold')).toBe('sources')
        expect(root().style.getPropertyValue('--vj-fold-cols')).toContain('minmax(0, 1fr)')
        expect(stored().folded).toEqual(['sources'])
        click(fold('Sources'))
        expect(root().getAttribute('data-fold')).toBeNull()
        expect(root().style.getPropertyValue('--vj-fold-cols')).toBe('')
        expect(window.localStorage.getItem(KEY)).toBeNull()
        expect(onPatchValues).not.toHaveBeenCalled() // nothing is written into the project document
    })

    it('a border next to a folded panel is not shown (none while one is folded) and returns on unfold', () => {
        mount()
        expect(seamIds()).toEqual(['s1', 's2', 's4', 's5', 's6'])
        click(fold('Clip'))
        expect(seamIds()).toEqual(['s1', 's2', 's4'])
        click(fold('Clip'))
        expect(seamIds()).toEqual(['s1', 's2', 's4', 's5', 's6'])
    })

    it('at least one panel stays open', () => {
        mount()
        click(fold('Sources'))
        click(fold('Clip'))
        expect(stored().folded).toEqual(['sources', 'clip'])
        expect(fold('Effects').getAttribute('aria-disabled')).toBe('true')
        click(fold('Effects'))
        expect(stored().folded).toEqual(['sources', 'clip'])
        expect(fold('Effects').getAttribute('aria-expanded')).toBe('true')
    })

    it('a stored fold is applied on load; an old layout without it and a corrupt value load as unfolded', () => {
        withLayout({ head: 0.1, folded: ['effects'] })
        mount()
        expect(root().getAttribute('data-fold')).toBe('effects')
        cleanup()
        withLayout({ head: 0.1 })
        mount()
        expect(root().getAttribute('data-fold')).toBeNull()
        cleanup()
        withLayout({ head: 0.1, folded: 'effects' })
        mount()
        expect(root().getAttribute('data-fold')).toBeNull()
        expect(fold('Effects').getAttribute('aria-expanded')).toBe('true')
    })

    it('the fold survives a reload of the deck (the same stored object)', () => {
        mount()
        click(fold('Effects'))
        cleanup()
        mount()
        expect(fold('Effects').getAttribute('aria-expanded')).toBe('false')
    })
})

describe('double-click and Delete reset ONE border', () => {
    it('a double-click on s5 puts Sources back to a third and leaves the Effects border where it was', () => {
        withLayout({ head: 0.1, cols: [0.4, 0.2] })
        mount()
        act(() => { fireEvent.doubleClick(seam('s5')) })
        // jsdom has no stylesheet: the column gap is 0, so a third of 1706 is 0.33333 of the box.
        expect(stored().cols[0]).toBeCloseTo(1 / 3, 3)
        expect(stored().cols[0] + stored().cols[1]).toBeCloseTo(0.6, 3)
        expect(stored().head).toBe(0.1)
    })

    it('Delete on a focused border does the same as a double-click; Backspace too', () => {
        withLayout({ head: 0.1, monitorW: 0.2 })
        mount()
        press(seam('s1'), 'Delete')
        expect(stored().head).toBeUndefined()
        expect(stored().monitorW).toBe(0.2)
        press(seam('s2'), 'Backspace')
        expect(window.localStorage.getItem(KEY)).toBeNull()
    })
})

describe('the layout lock', () => {
    const lock = () => screen.getByRole('button', { name: /^(Lock|Unlock) layout$/ })

    it('one toggle beside the layout controls, aria-pressed, stored per viewer in the layout object', () => {
        const onPatchValues = mount()
        expect(lock().textContent).toBe('Lock layout')
        expect(lock().getAttribute('aria-pressed')).toBe('false')
        click(lock())
        expect(lock().textContent).toBe('Unlock layout')
        expect(lock().getAttribute('aria-pressed')).toBe('true')
        expect(stored().locked).toBe(true)
        expect(root().getAttribute('data-locked')).toBe('true')
        click(lock())
        expect(window.localStorage.getItem(KEY)).toBeNull()
        expect(onPatchValues).not.toHaveBeenCalled()
    })

    it('locking alone does not make the layout look customised, and is never automatic', () => {
        mount()
        expect(root().getAttribute('data-locked')).toBeNull()
        click(lock())
        expect(root().getAttribute('data-layout')).toBe('default')
        expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull()
    })

    it('locked: no drag, no keys, no double-click, no fold; the borders are out of the tab order', () => {
        withLayout({ head: 0.1, monitorW: 0.2, locked: true })
        mount()
        const before = window.localStorage.getItem(KEY)
        const grip = seam('s2')
        expect(grip.getAttribute('data-locked')).toBe('true')
        expect(grip.getAttribute('tabindex')).toBe('-1')
        act(() => { fireEvent.pointerDown(grip, { clientX: 1000, clientY: 100, button: 0, pointerId: 1 }) })
        act(() => { fireEvent.pointerMove(grip, { clientX: 900, clientY: 100, pointerId: 1 }) })
        act(() => { fireEvent.pointerUp(grip, { clientX: 900, clientY: 100, pointerId: 1 }) })
        expect(root().hasAttribute('data-seam-dragging')).toBe(false)
        press(grip, 'ArrowRight')
        press(grip, 'Home')
        press(grip, 'Delete')
        act(() => { fireEvent.doubleClick(grip) })
        click(fold('Sources'))
        act(() => { vi.advanceTimersByTime(400) })
        expect(window.localStorage.getItem(KEY)).toBe(before)
        expect(fold('Sources').getAttribute('aria-expanded')).toBe('true')
        expect(fold('Sources').getAttribute('title')).toContain('locked')
    })

    it('the whole-layout reset still works while locked, and keeps the lock', () => {
        withLayout({ head: 0.1, folded: ['clip'], locked: true })
        mount()
        click(screen.getByRole('button', { name: 'Reset layout' }))
        expect(stored()).toEqual({ v: 1, locked: true })
        expect(root().getAttribute('data-fold')).toBeNull()
        expect(root().getAttribute('data-locked')).toBe('true')
    })

    it('unlocked again, everything moves', () => {
        withLayout({ head: 0.1, locked: true })
        mount()
        click(lock())
        press(seam('s1'), 'ArrowRight')
        act(() => { vi.advanceTimersByTime(400) })
        expect(stored().head).toBeGreaterThan(0.1)
    })
})

describe('G8: K2 open', () => {
    it('the deck root says so, and the borders are still rendered', () => {
        mount()
        expect(root().getAttribute('data-k2')).toBeNull()
        click(screen.getByRole('button', { name: 'K2' }))
        expect(root().getAttribute('data-k2')).toBe('open')
        expect(seamIds()).toEqual(['s1', 's2', 's4', 's5', 's6'])
    })
})

describe('G10: hidden borders say why', () => {
    it('a narrow deck shows one plain line; a wide one shows none', () => {
        mount()
        expect(screen.queryByRole('note')).toBeNull()
        resizeTo(800)
        expect(screen.getByRole('note').textContent).toContain('Some borders are hidden at this width')
        resizeTo(1706)
        expect(screen.queryByRole('note')).toBeNull()
    })
})
