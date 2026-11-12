import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import K2LayoutPanel from './K2LayoutPanel.jsx'
import { createK2Monitor, TOUCH_MS } from './k2Monitor.js'
import { describeAction, effectiveMap, normalizeOverrides } from './deckBinding.js'
import { XONE_K2_CONTROLS, defaultMap } from './xoneK2.js'
import { createDeck } from '../../project/tops/vjDeck.js'
import { useDeckMidi } from './useDeckMidi.js'

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

const msg = (kind, number, value) => (kind === 'cc' ? { kind: 'cc', cc: number, channel: 15, value } : { kind: value ? 'noteOn' : 'noteOff', note: number, channel: 15, velocity: value })
const mountPanel = (map = defaultMap(), monitor = createK2Monitor(), onClose = () => {}) => ({ monitor, onClose, ...render(<K2LayoutPanel map={map} monitor={monitor} onClose={onClose} />) })

describe('describeAction', () => {
    it('words the actions, and says free for none', () => {
        expect(describeAction({ action: 'opacity', args: { layer: 1 } })).toBe('Layer 2 level')
        expect(describeAction({ action: 'clip', args: { layer: 0, column: 2 } })).toBe('L1 clip 3')
        expect(describeAction({ action: 'bypass', args: { layer: 0 } })).toBe('Bypass L1')
        expect(describeAction({ action: 'bpm', args: {} })).toBe('BPM')
        expect(describeAction({ action: 'fx', args: { param: 'mix', layer: -1 } })).toBe('Master fx mix')
        expect(describeAction(undefined)).toBe('free')
    })
})

describe('K2 layout panel', () => {
    it('draws all 58 controls, each labelled from the map', () => {
        mountPanel()
        const all = document.querySelectorAll('[data-k2]')
        expect(all).toHaveLength(XONE_K2_CONTROLS.length)
        expect(XONE_K2_CONTROLS).toHaveLength(58)
        expect(screen.getByLabelText('fader 1: Layer 1 level')).toBeTruthy()
        expect(screen.getByLabelText('matrix G: L2 clip 3')).toBeTruthy()
        expect(screen.getByLabelText('pot switch 1: Bypass L1')).toBeTruthy()
        expect(screen.getByLabelText('encoder 1: BPM')).toBeTruthy()
        expect(screen.getByLabelText('layer button: Next FX layer')).toBeTruthy()
    })

    it('a learned override changes the label', () => {
        const overrides = normalizeOverrides({ bindings: [{ match: { kind: 'cc', number: 16, channel: 15 }, action: 'master', args: {} }] })
        mountPanel(effectiveMap(defaultMap(), overrides))
        expect(screen.getByLabelText('fader 1: Master')).toBeTruthy()
    })

    it('click shows the hardware name, message and mapping; Escape and Close close it', () => {
        const onClose = vi.fn()
        mountPanel(defaultMap(), createK2Monitor(), onClose)
        fireEvent.click(screen.getByLabelText('fader 1: Layer 1 level'))
        expect(within(screen.getByRole('status')).getByText('fader 1 · CC 16 · Layer 1 level')).toBeTruthy()
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onClose).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Close the K2 layout' }))
        expect(onClose).toHaveBeenCalledTimes(2)
    })

    it('lights a button while held and a fader with its value, for about 600 ms', () => {
        const { monitor } = mountPanel()
        act(() => monitor.push(msg('note', 36, 127)))
        expect(screen.getByLabelText('matrix A: L1 clip 1').className).toContain('is-held')
        act(() => monitor.push(msg('note', 36, 0)))
        expect(screen.getByLabelText('matrix A: L1 clip 1').className).not.toContain('is-held')
        act(() => monitor.push(msg('cc', 16, 64)))
        act(() => { vi.advanceTimersByTime(40) })
        const fader = screen.getByLabelText('fader 1: Layer 1 level')
        expect(fader.className).toContain('is-lit')
        expect(fader.querySelector('[data-k2-value]').textContent).toBe('64')
        expect(fader.style.getPropertyValue('--k2-fill')).toBe('50%')
        act(() => { vi.advanceTimersByTime(TOUCH_MS + 60) })
        expect(screen.getByLabelText('fader 1: Layer 1 level').className).not.toContain('is-lit')
    })
})

describe('monitor throttle', () => {
    it('publishes a sweep at about 30 a second, the last value included', () => {
        const monitor = createK2Monitor()
        let published = 0
        monitor.subscribe(() => { published += 1 })
        for (let value = 0; value < 100; value += 1) { monitor.push(msg('cc', 16, value)); vi.advanceTimersByTime(3) }
        vi.advanceTimersByTime(50)
        expect(published).toBeLessThan(15)
        expect(monitor.getSnapshot().values['cc:16']).toBe(99)
    })
})

describe('through the hook', () => {
    it('a message lights its control even when nothing is bound to it', async () => {
        const input = { id: 'in', name: 'XONE:K2 MIDI 1', onmidimessage: null }
        const access = { inputs: new Map([['in', input]]), outputs: new Map(), onstatechange: null }
        vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: vi.fn(() => Promise.resolve(access)) })
        const view = renderHook(() => useDeckMidi({ deck: createDeck({ layers: 2, columns: 4 }), write: () => {}, onPatch: () => {}, enabled: true, deckId: 'k2-panel' }))
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        const { map, k2Monitor } = view.result.current
        render(<K2LayoutPanel map={map} monitor={k2Monitor} onClose={() => {}} />)
        // the owner's K2 sends on channel 2; layer button (note 12) is free in the map
        act(() => input.onmidimessage({ data: [0x91, 12, 127] }))
        expect(screen.getByLabelText('layer button: Next FX layer').className).toContain('is-held')
        act(() => input.onmidimessage({ data: [0xb1, 16, 100] }))
        act(() => { vi.advanceTimersByTime(40) })
        expect(screen.getByLabelText('fader 1: Layer 1 level').querySelector('[data-k2-value]').textContent).toBe('100')
    })
})
