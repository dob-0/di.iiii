import { Profiler } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck } from '../../../project/tops/vjDeck.js'

// The draggable borders of the deck (DeckSeam.jsx, useDeckLayout.js, deckLayout.js).
// jsdom has no layout: the deck box is mocked (clientWidth/clientHeight) and so is ResizeObserver.
const KEY = 'di.vjDeck.layout'
let box
let observers
let frames

const stored = () => { try { return JSON.parse(window.localStorage.getItem(KEY)) } catch { return null } }
const root = () => document.querySelector('.vj-deck')
const seam = (id) => document.querySelector(`.vj-deck-seam[data-seam="${id}"]`)
const seamIds = () => [...document.querySelectorAll('.vj-deck-seam')].map((element) => element.getAttribute('data-seam'))
const resizeTo = (width, height = box.height) => {
    box = { width, height }
    act(() => { observers.forEach((callback) => callback([])) })
}
const press = (element, key, init = {}) => act(() => { fireEvent.keyDown(element, { key, ...init }) })
const settle = () => act(() => { vi.advanceTimersByTime(300) })

function mount(onPatchValues = vi.fn()) {
    render(<VjDeckView node={{ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } }} onPatchValues={onPatchValues} />)
    return onPatchValues
}

beforeEach(() => {
    vi.useFakeTimers()
    box = { width: 1706, height: 838 }
    observers = []
    frames = []
    try { window.localStorage.clear() } catch { /* none */ }
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => box.width)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => box.height)
    vi.stubGlobal('ResizeObserver', class { constructor(callback) { observers.push(callback) } observe() {} disconnect() {} })
    vi.stubGlobal('requestAnimationFrame', (callback) => { frames.push(callback); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const layout = { v: 1, head: 0.1, monitorW: 0.18, bottomH: 0.3, cols: [0.3, 0.3] }
const withLayout = (value = layout) => window.localStorage.setItem(KEY, JSON.stringify(value))

describe('seams exist and say what they are', () => {
    it('every rendered seam has its role, orientation, label and aria values in percent', () => {
        withLayout()
        mount()
        expect(seamIds().sort()).toEqual(['s1', 's2', 's4', 's5', 's6'])
        document.querySelectorAll('.vj-deck-seam').forEach((element) => {
            expect(element.getAttribute('role')).toBe('separator')
            expect(element.getAttribute('tabindex')).toBe('0')
            expect(['vertical', 'horizontal']).toContain(element.getAttribute('aria-orientation'))
            expect(element.getAttribute('aria-label')).toBeTruthy()
            expect(document.getElementById(element.getAttribute('aria-controls'))).toBeTruthy()
            expect(element.getAttribute('title')).toBe('Drag to resize. Double-click to reset.')
            const now = Number(element.getAttribute('aria-valuenow'))
            expect(now).toBeGreaterThanOrEqual(Number(element.getAttribute('aria-valuemin')))
            expect(now).toBeLessThanOrEqual(Number(element.getAttribute('aria-valuemax')))
        })
        expect(seam('s2').getAttribute('aria-valuenow')).toBe('18')
        expect(seam('s4').getAttribute('aria-orientation')).toBe('horizontal')
        expect(seam('s2').getAttribute('aria-valuemax')).toBe('28')
    })

    it('nothing stored: no variable, no inline style, data-layout says default', () => {
        mount()
        expect(root().getAttribute('style')).toBeNull()
        expect(root().getAttribute('data-layout')).toBe('default')
        expect(root().getAttribute('data-bottom')).toBeNull()
        expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull()
    })

    it('a stored layout paints variables and data-layout says custom', () => {
        withLayout()
        mount()
        expect(root().getAttribute('data-layout')).toBe('custom')
        expect(root().style.getPropertyValue('--vj-head')).toBe('170.6px')
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe('307.08px')
        expect(root().getAttribute('data-bottom')).toBe('fixed')
        expect(root().getAttribute('data-cols')).toBe('fixed')
    })
})

describe('keys (window splitter)', () => {
    it('arrow, Shift+arrow, Home, End and Enter change the value', () => {
        withLayout()
        mount()
        const head = seam('s1')
        expect(head.getAttribute('aria-valuenow')).toBe('10')
        press(head, 'ArrowRight')
        expect(head.getAttribute('aria-valuenow')).toBe('11')
        press(head, 'ArrowLeft')
        expect(head.getAttribute('aria-valuenow')).toBe('10')
        press(head, 'ArrowRight', { shiftKey: true })
        expect(head.getAttribute('aria-valuenow')).toBe('16') // 20% clamps at 280px = 16%
        press(head, 'Home')
        expect(head.getAttribute('aria-valuenow')).toBe('9') // 150px
        press(head, 'End')
        expect(head.getAttribute('aria-valuenow')).toBe('16')
        press(head, 'Enter') // from 16: to min
        expect(head.getAttribute('aria-valuenow')).toBe('9')
        press(head, 'Enter') // at min: back to the value it left
        expect(head.getAttribute('aria-valuenow')).toBe('16')
    })

    it('Right moves the S2 seam right: the monitor column gets narrower; Up grows the bottom row', () => {
        withLayout()
        mount()
        press(seam('s2'), 'ArrowRight')
        expect(seam('s2').getAttribute('aria-valuenow')).toBe('17')
        press(seam('s4'), 'ArrowUp')
        expect(seam('s4').getAttribute('aria-valuenow')).toBe('31')
    })

    it('the key is stored after 250 ms, not before', () => {
        withLayout()
        mount()
        press(seam('s1'), 'ArrowRight')
        expect(stored().head).toBeCloseTo(0.1, 5)
        settle()
        expect(stored().head).toBeCloseTo(0.11, 2)
    })

    it('the seam stops the key: the deck listeners never see Enter or Escape', () => {
        withLayout()
        mount()
        const seen = vi.fn()
        document.addEventListener('keydown', seen)
        press(seam('s1'), 'Enter')
        press(seam('s1'), 'ArrowRight')
        press(seam('s1'), 'Home')
        expect(seen).not.toHaveBeenCalled()
        seam('s1').focus()
        press(seam('s1'), 'Escape')
        expect(document.activeElement).not.toBe(seam('s1'))
        expect(seen).not.toHaveBeenCalled()
        document.removeEventListener('keydown', seen)
    })
})

describe('reset', () => {
    it('a double-click resets that one seam', () => {
        withLayout()
        mount()
        act(() => { fireEvent.doubleClick(seam('s2')) })
        expect(stored().monitorW).toBeUndefined()
        expect(stored().head).toBe(0.1)
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe('')
        expect(root().style.getPropertyValue('--vj-head')).toBe('170.6px')
    })

    it('Reset layout clears the key and every variable, and is then not rendered', () => {
        withLayout()
        mount()
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Reset layout' })) })
        expect(window.localStorage.getItem(KEY)).toBeNull()
        expect(root().getAttribute('style')).toBeNull()
        expect(root().getAttribute('data-layout')).toBe('default')
        expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull()
    })
})

describe('drag and the document', () => {
    it('a drag moves the variable live, stores on pointerup, and never calls the document write', () => {
        const onPatchValues = mount()
        const grip = seam('s2')
        act(() => { fireEvent.pointerDown(grip, { clientX: 1000, clientY: 100, button: 0, pointerId: 1 }) })
        act(() => { fireEvent.pointerMove(grip, { clientX: 900, clientY: 100, pointerId: 1 }) })
        act(() => { frames.splice(0).forEach((frame) => frame(0)) })
        expect(Number.parseFloat(root().style.getPropertyValue('--vj-monitor-w'))).toBeGreaterThan(0)
        expect(window.localStorage.getItem(KEY)).toBeNull() // nothing stored while dragging
        act(() => { fireEvent.pointerUp(grip, { clientX: 900, clientY: 100, pointerId: 1 }) })
        expect(stored().monitorW).toBeGreaterThan(0)
        expect(onPatchValues).not.toHaveBeenCalled()
    })

    it('keys and a reset never call the document write either', () => {
        withLayout()
        const onPatchValues = mount()
        press(seam('s1'), 'ArrowRight')
        press(seam('s4'), 'End')
        act(() => { fireEvent.doubleClick(seam('s5')) })
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Reset layout' })) })
        settle()
        expect(onPatchValues).not.toHaveBeenCalled()
    })

    it('does not remount the deck: the root element is the same after a drag', () => {
        mount()
        const before = root()
        const grip = seam('s1')
        act(() => { fireEvent.pointerDown(grip, { clientX: 300, clientY: 100, button: 0, pointerId: 1 }) })
        act(() => { fireEvent.pointerMove(grip, { clientX: 340, clientY: 100, pointerId: 1 }) })
        act(() => { fireEvent.pointerUp(grip, { clientX: 340, clientY: 100, pointerId: 1 }) })
        expect(root()).toBe(before)
    })
})

describe('clamp to the box', () => {
    it('a stored layout larger than the box is clamped, and the stored value stays', () => {
        withLayout({ v: 1, monitorW: 0.6 })
        mount()
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe('480px')
        resizeTo(950)
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe(`${950 - 734}px`)
        expect(stored().monitorW).toBe(0.6)
        resizeTo(1706)
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe('480px')
    })

    it('S1 and S2 are absent at a box of 900 px, S5 and S6 (and S4) at 560 px, and no variable is applied', () => {
        withLayout()
        mount()
        resizeTo(900)
        expect(seamIds().sort()).toEqual(['s4', 's5', 's6'])
        expect(root().style.getPropertyValue('--vj-head')).toBe('')
        expect(root().style.getPropertyValue('--vj-monitor-w')).toBe('')
        resizeTo(560)
        expect(seamIds()).toEqual([])
        expect(root().getAttribute('style')).toBeNull()
        expect(stored().head).toBe(0.1)
        resizeTo(901)
        expect(seamIds().sort()).toEqual(['s1', 's2', 's4', 's5', 's6'])
    })
})

describe('the monitor presets and the other keys', () => {
    it('S / M / L clears monitorW; while it is set none of them is pressed', () => {
        withLayout()
        mount()
        const pressed = () => ['S', 'M', 'L'].map((name) => screen.getByRole('button', { name: `Monitor size ${name}` }).getAttribute('aria-pressed'))
        expect(pressed()).toEqual(['false', 'false', 'false'])
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Monitor size S' })) })
        expect(stored().monitorW).toBeUndefined()
        expect(stored().head).toBe(0.1)
        expect(pressed()).toEqual(['true', 'false', 'false'])
        expect(JSON.parse(window.localStorage.getItem('di.vjDeck.monitors')).size).toBe('s')
    })

    it('an old di.vjDeck.monitors value {"size":"m"} still reads', () => {
        window.localStorage.setItem('di.vjDeck.monitors', '{"size":"m"}')
        mount()
        expect(root().getAttribute('data-monitor-size')).toBe('m')
        expect(screen.getByRole('button', { name: 'Monitor size M' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('Preview only is never written to storage', () => {
        withLayout()
        mount()
        act(() => { fireEvent.click(screen.getByRole('button', { name: /Preview only/ })) })
        press(seam('s2'), 'ArrowRight')
        settle()
        const all = Object.keys(window.localStorage).map((key) => window.localStorage.getItem(key)).join(' ')
        expect(all).not.toMatch(/previewOnly/i)
        expect(root().getAttribute('data-preview-only')).toBe('true')
    })
})


// Repairs after the review and the hand walk of 2026-11-11 (fix-3 F1 to F6, F9).
describe('storage that throws', () => {
    it('F1: a localStorage getter that throws still renders the default layout, and a write does nothing', () => {
        vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
        expect(() => mount()).not.toThrow()
        expect(root().getAttribute('data-layout')).toBe('default')
        expect(root().getAttribute('style')).toBeNull()
        expect(() => { press(seam('s1'), 'ArrowRight'); settle() }).not.toThrow()
        expect(root().getAttribute('data-layout')).toBe('custom') // the choice lives for this visit only
    })
})

describe('a drag stores only a real move', () => {
    const down = (grip, x, id = 1) => act(() => { fireEvent.pointerDown(grip, { clientX: x, clientY: 100, button: 0, pointerId: id }) })
    const move = (grip, x, id = 1) => act(() => { fireEvent.pointerMove(grip, { clientX: x, clientY: 100, pointerId: id }) })
    const up = (grip, x, id = 1) => act(() => { fireEvent.pointerUp(grip, { clientX: x, clientY: 100, pointerId: id }) })
    const nothing = () => {
        expect(stored()).toBeNull()
        expect(root().getAttribute('data-layout')).toBe('default')
        expect(root().hasAttribute('data-bottom')).toBe(false)
        expect(screen.queryByRole('button', { name: 'Reset layout' })).toBeNull()
    }

    it('F3: a click with less than a pixel of jitter stores nothing and leaves the layout unset', () => {
        mount()
        const grip = seam('s2')
        down(grip, 1000)
        move(grip, 1000.4)
        up(grip, 1000.4)
        nothing()
    })

    it('F3: a drag out and back to the start stores nothing', () => {
        mount()
        const grip = seam('s4')
        act(() => { fireEvent.pointerDown(grip, { clientX: 500, clientY: 700, button: 0, pointerId: 1 }) })
        act(() => { fireEvent.pointerMove(grip, { clientX: 500, clientY: 640, pointerId: 1 }) })
        act(() => { fireEvent.pointerMove(grip, { clientX: 500, clientY: 700, pointerId: 1 }) })
        act(() => { fireEvent.pointerUp(grip, { clientX: 500, clientY: 700, pointerId: 1 }) })
        nothing()
    })

    it('F4: a lost pointer capture cancels the drag: no mark, nothing stored, a later pointerup does nothing', () => {
        mount()
        const grip = seam('s2')
        down(grip, 1000)
        move(grip, 900)
        expect(grip.classList.contains('is-dragging')).toBe(true)
        act(() => { fireEvent.lostPointerCapture(grip, { pointerId: 1 }) })
        expect(grip.classList.contains('is-dragging')).toBe(false)
        expect(root().hasAttribute('data-seam-dragging')).toBe(false)
        up(grip, 900)
        nothing()
    })

    it('F4: a second pointer while a drag is open is ignored (its move and its up change nothing)', () => {
        mount()
        const grip = seam('s2')
        down(grip, 1000, 1)
        down(grip, 400, 2)
        move(grip, 100, 2)
        up(grip, 100, 2)
        expect(grip.classList.contains('is-dragging')).toBe(true) // still the first drag
        move(grip, 900, 1)
        up(grip, 900, 1)
        // pointer 1 moved left by 100 px: the monitor column grew by 100 px from its measured 140 min.
        expect(stored().monitorW).toBeCloseTo(240 / 1706, 4)
    })

    it('F5: the deck root carries a mark from drag start to drag end', () => {
        mount()
        const grip = seam('s5')
        expect(root().hasAttribute('data-seam-dragging')).toBe(false)
        down(grip, 600)
        expect(root().getAttribute('data-seam-dragging')).toBe('s5')
        move(grip, 650)
        up(grip, 650)
        expect(root().hasAttribute('data-seam-dragging')).toBe(false)
    })
})

describe('the size observer during a drag of S4', () => {
    it('F2: no render while the drag is open, one commit after it', () => {
        let bottom = 265
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
            const height = this.classList?.contains('vj-deck-bottom') ? bottom : 0
            return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: height, width: 0, height, toJSON() {} }
        })
        let renders = 0
        render(
            <Profiler id="deck" onRender={() => { renders += 1 }}>
                <VjDeckView node={{ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } }} onPatchValues={vi.fn()} />
            </Profiler>
        )
        settle()
        const grip = seam('s4')
        act(() => { fireEvent.pointerDown(grip, { clientX: 500, clientY: 700, button: 0, pointerId: 1 }) })
        const before = renders
        for (let step = 1; step <= 8; step += 1) {
            act(() => { fireEvent.pointerMove(grip, { clientX: 500, clientY: 700 - step * 10, pointerId: 1 }) })
            act(() => { frames.splice(0).forEach((frame) => frame(0)) })
            bottom = 265 + step * 10 // the preview changes the bottom row every frame
            act(() => { observers.forEach((callback) => callback([])) }) // and the observer fires
        }
        expect(renders - before).toBe(0)
        act(() => { fireEvent.pointerUp(grip, { clientX: 500, clientY: 620, pointerId: 1 }) })
        expect(renders - before).toBeGreaterThanOrEqual(1)
        expect(renders - before).toBeLessThanOrEqual(2)
        expect(stored().bottomH).toBeGreaterThan(0)
    })
})

describe('what is announced and what is a tab stop', () => {
    it('F6: after S / M / L the announced value of an unset seam is the fresh one', () => {
        window.localStorage.setItem('di.vjDeck.monitors', '{"size":"l"}')
        const widths = { s: 140, m: 210, l: 300 }
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
            const width = this.classList?.contains('vj-deck-monitors') ? widths[root().getAttribute('data-monitor-size')] : 0
            return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: 0, toJSON() {} }
        })
        mount()
        expect(seam('s2').getAttribute('aria-valuenow')).toBe(String(Math.round((300 / 1706) * 100)))
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Monitor size S' })) })
        expect(seam('s2').getAttribute('aria-valuenow')).toBe(String(Math.round((140 / 1706) * 100)))
        act(() => { fireEvent.click(screen.getByRole('button', { name: 'Monitor size M' })) })
        expect(seam('s2').getAttribute('aria-valuenow')).toBe(String(Math.round((210 / 1706) * 100)))
    })

    it('F9: the file input is out of the tab order and the accessibility tree; the visible button works by keyboard', () => {
        const onUploadFile = vi.fn()
        render(<VjDeckView node={{ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } }} onPatchValues={vi.fn()} onUploadFile={onUploadFile} />)
        const input = document.querySelector('.vj-deck-upload input[type="file"]')
        expect(input.getAttribute('tabindex')).toBe('-1')
        expect(input.getAttribute('aria-hidden')).toBe('true')
        const button = screen.getByRole('button', { name: 'Upload video' })
        expect(button.getAttribute('tabindex')).toBe('0')
        const click = vi.spyOn(input, 'click')
        fireEvent.keyDown(button, { key: 'Enter' })
        fireEvent.keyDown(button, { key: ' ' })
        fireEvent.keyDown(button, { key: 'a' })
        expect(click).toHaveBeenCalledTimes(2)
    })
})
