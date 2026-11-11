import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import K2Window from './K2Window.jsx'
import K2LayoutPanel, { BLOCKED_NOTE, WINDOW_FEATURES } from './K2LayoutPanel.jsx'
import { K2_WINDOW_NAME, createK2Publisher } from './k2Channel.js'
import { jobsFor, linesFor } from './k2Jobs.js'
import { createK2Monitor } from './k2Monitor.js'
import face from './xone-k2-face.json'
import { K2_CONSOLES, XONE_K2_CONTROLS } from './xoneK2.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const bus = () => {
    const all = new Set()
    const make = () => {
        const channel = { onmessage: null, postMessage(data) { for (const other of all) if (other !== channel) other.onmessage?.({ data }) }, close() { all.delete(channel) } }
        all.add(channel)
        return channel
    }
    return { make }
}
const parts = (current) => ({ controller: 'XONE:K2', consoleId: current.id, consoleName: current.name, labels: jobsFor(current.map, current, 0), lines: linesFor(current.map, current, 0), lights: { 'matrix A': 'green' }, values: { 'fader 1': 10 }, held: {} })
const setup = (current = K2_CONSOLES[0]) => {
    const { make } = bus()
    const queue = []
    const timers = []
    const publisher = createK2Publisher({ source: () => parts(current), makeChannel: make, frame: (cb) => { queue.push(cb); return queue.length }, cancelFrame: () => { queue.length = 0 } })
    publisher.ensure()
    const props = { makeChannel: make, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length }, clearTimer: () => {}, now: () => 1000 }
    return { publisher, props, timers, runFrame: () => act(() => { queue.splice(0).forEach((cb) => cb()) }) }
}
const controlEl = (name) => document.querySelector(`[data-control="${name}"]`)

describe('K2 controller window', () => {
    it('says it is waiting for the deck page when nothing answers within a second', () => {
        const { make } = bus()
        const timers = []
        render(<K2Window makeChannel={make} setTimer={(fn, ms) => { timers.push({ fn, ms }); return timers.length }} clearTimer={() => {}} now={() => 1000} />)
        expect(screen.getByText('Asking the deck page...')).toBeTruthy()
        const wait = timers.find((timer) => timer.ms === 1000)
        act(() => wait.fn())
        expect(screen.getByText(/Waiting for the deck page/)).toBeTruthy()
        expect(screen.getAllByText(/waiting for the deck page/).length).toBeGreaterThan(0)
    })

    it('shows the snapshot: every face control once, in device order, each with its job, and never asks for MIDI', () => {
        const requestMIDIAccess = vi.fn()
        vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess })
        const { props } = setup()
        render(<K2Window {...props} />)
        const drawn = Array.from(document.querySelectorAll('[data-control]')).map((el) => el.getAttribute('data-control'))
        expect(drawn).toEqual(Object.keys(face.controls))
        expect(drawn).toHaveLength(XONE_K2_CONTROLS.length)
        expect(controlEl('fader 1').getAttribute('aria-label')).toBe('fader 1: Layer 1 level')
        expect(controlEl('fader 1').getAttribute('data-value')).toBe('10')
        expect(controlEl('matrix A').getAttribute('class')).toContain('is-lit')
        expect(controlEl('pot 1').getAttribute('tabindex')).toBe('0')
        expect(screen.getByText('XONE:K2 · K2')).toBeTruthy()
        expect(requestMIDIAccess).not.toHaveBeenCalled()
    })

    it('draws the same words as the panel cells, for both consoles', () => {
        for (const current of K2_CONSOLES) {
            const { props } = setup(current)
            const view = render(<K2Window {...props} />)
            const windowLabels = Object.fromEntries(Array.from(document.querySelectorAll('[data-control]')).map((el) => [el.getAttribute('data-control'), el.getAttribute('aria-label')]))
            view.unmount()
            const panel = render(<K2LayoutPanel map={current.map} monitor={createK2Monitor()} console={current} onClose={() => {}} />)
            const panelLabels = Object.fromEntries(Array.from(document.querySelectorAll('[data-k2]')).map((el) => [el.getAttribute('data-k2'), el.getAttribute('aria-label')]))
            panel.unmount()
            expect(Object.keys(windowLabels)).toHaveLength(58)
            expect(windowLabels).toEqual(panelLabels)
        }
        // the dead fader of K2 (1.9) reads "not used" in the window too
        const { props } = setup(K2_CONSOLES[1])
        render(<K2Window {...props} />)
        expect(controlEl('fader 4').getAttribute('aria-label')).toBe('fader 4: not used')
        expect(controlEl('fader 4').getAttribute('class')).toContain('is-unused')
    })

    it('moves the right control when an event comes, in one batch per frame', () => {
        const { props, publisher, runFrame } = setup()
        render(<K2Window {...props} />)
        act(() => { publisher.push({ control: 'fader 2', value: 40 }); publisher.push({ control: 'fader 2', value: 100 }); publisher.push({ control: 'matrix B', value: 127, held: true }) })
        expect(controlEl('fader 2').getAttribute('data-value')).toBeNull()
        runFrame()
        expect(controlEl('fader 2').getAttribute('data-value')).toBe('100')
        expect(controlEl('fader 1').getAttribute('data-value')).toBe('10')
        expect(controlEl('matrix B').getAttribute('class')).toContain('is-lit')
        act(() => { publisher.push({ control: 'matrix B', value: 0, held: false }) })
        runFrame()
        expect(controlEl('matrix B').getAttribute('class')).not.toContain('is-lit')
        const cap = controlEl('fader 2').querySelector('.k2w-cap')
        expect(Number(cap.getAttribute('y'))).toBeGreaterThan(0)
    })

    it('shows the full line on hover and focus, and a click pins it', () => {
        const { props } = setup()
        render(<K2Window {...props} />)
        const readout = () => document.querySelector('[data-readout]').textContent
        expect(readout()).toMatch(/Hover or Tab/)
        fireEvent.mouseEnter(controlEl('fader 1'))
        expect(readout()).toBe('fader 1 · CC 16 · Layer 1 level · value 10')
        fireEvent.mouseLeave(controlEl('fader 1'))
        fireEvent.focus(controlEl('encoder 1'))
        expect(readout()).toBe('encoder 1 · CC 0 · BPM')
        fireEvent.click(controlEl('matrix A'))
        fireEvent.mouseEnter(controlEl('pot 1'))
        expect(readout()).toBe('matrix A · N 36 · L1 clip 1')
        fireEvent.click(controlEl('matrix A'))
        expect(readout()).toBe('pot 1 · CC 4 · L1 blend')
    })

    it('has nothing that writes: no trigger, no mapping edit', () => {
        const { props } = setup()
        render(<K2Window {...props} />)
        const clicks = document.querySelectorAll('[data-control]')
        clicks.forEach((el) => fireEvent.click(el))
        expect(document.querySelectorAll('input, select, textarea, form')).toHaveLength(0)
    })
})

describe('the Device button', () => {
    const panel = (extra = {}) => render(<K2LayoutPanel map={K2_CONSOLES[0].map} monitor={createK2Monitor()} console={K2_CONSOLES[0]} onClose={() => {}} windowPath="/s/perform/p/k2" {...extra} />)

    it('says so in one line when the browser blocks the pop-out', () => {
        const openWindow = vi.fn(() => null)
        panel({ openWindow })
        fireEvent.click(screen.getByRole('button', { name: 'Device' }))
        expect(openWindow).toHaveBeenCalledWith('/s/perform/p/k2', K2_WINDOW_NAME, WINDOW_FEATURES)
        expect(screen.getByRole('alert').textContent).toBe(BLOCKED_NOTE)
    })

    it('opens one named window, and a second press brings it forward', () => {
        const opened = { closed: false, focus: vi.fn() }
        const openWindow = vi.fn(() => opened)
        const publisher = { ensure: vi.fn() }
        panel({ openWindow, publisher })
        const button = screen.getByRole('button', { name: 'Device' })
        expect(button.getAttribute('title')).toBe('Open the controller as a picture in its own window')
        fireEvent.click(button)
        fireEvent.click(button)
        expect(openWindow).toHaveBeenCalledTimes(1)
        expect(opened.focus).toHaveBeenCalledTimes(2)
        expect(publisher.ensure).toHaveBeenCalledTimes(2)
        expect(screen.queryByRole('alert')).toBeNull()
        expect(WINDOW_FEATURES).toMatch(/width=440,height=1000/)
    })

    it('appears only when the console has a face and a path is given', () => {
        panel({ windowPath: '' })
        expect(screen.queryByRole('button', { name: 'Device' })).toBeNull()
        cleanup()
        panel({ console: { id: 'x', name: 'Other', controller: 'SOME OTHER', map: [], free: [] } })
        expect(screen.queryByRole('button', { name: 'Device' })).toBeNull()
        cleanup()
        panel()
        expect(screen.getByRole('button', { name: 'Device' })).toBeTruthy()
    })
})
