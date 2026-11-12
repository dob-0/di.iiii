import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import K2LayoutPanel from './K2LayoutPanel.jsx'
import DeckMidiControl from './DeckMidiControl.jsx'
import { createK2Monitor } from './k2Monitor.js'
import { effectiveMap, normalizeOverrides } from './deckBinding.js'
import { consoleOf, defaultMap } from './xoneK2.js'
import { createDeck } from '../../project/tops/vjDeck.js'
import { useDeckMidi } from './useDeckMidi.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const hook = (props) => renderHook(() => useDeckMidi({ deck: createDeck({ layers: 6, columns: 4 }), write: () => {}, enabled: false, ...props }))

describe('T6 the hook and the console', () => {
    it('midiConsole k2-1.9 gives the 1.9 map; missing or unknown gives K2', () => {
        const entry = (map, name) => map.find((item) => item.match.number === name)
        const fader4 = (result) => result.current.map.find((item) => item.match.kind === 'cc' && item.match.number === 19)
        expect(fader4(hook({ console: 'k2-1.9' }).result)).toBeUndefined()
        expect(hook({ console: 'k2-1.9' }).result.current.k2Console.name).toBe('K2 (1.9)')
        for (const value of [undefined, 'zzz', null]) {
            const { result } = hook({ console: value })
            expect(result.current.k2Console.name).toBe('K2')
            expect(fader4(result)).toMatchObject({ action: 'opacity', args: { layer: 3 } })
        }
        expect(entry(hook({ console: 'k2-1.9' }).result.current.map, 15)).toMatchObject({ action: 'opacity', args: { layer: 3 } })
    })

    it('picking a console patches { midiConsole } only; an unknown id patches nothing', () => {
        const onPatch = vi.fn()
        const { result } = hook({ onPatch, stored: { bindings: [] } })
        act(() => { result.current.pickConsole('k2-1.9') })
        expect(onPatch).toHaveBeenCalledTimes(1)
        expect(onPatch).toHaveBeenCalledWith({ midiConsole: 'k2-1.9' })
        expect(result.current.pickConsole('nope')).toBe(false)
        expect(onPatch).toHaveBeenCalledTimes(1)
    })

    it('a learned override stays on top of the 1.9 console', () => {
        const stored = { bindings: [{ match: { kind: 'cc', number: 19, channel: 15 }, action: 'opacity', args: { layer: 5 } }] }
        const { result } = hook({ console: 'k2-1.9', stored })
        expect(result.current.map.find((item) => item.match.number === 19)).toMatchObject({ action: 'opacity', args: { layer: 5 } })
    })
})

describe('T7 the panel and the deck state text', () => {
    const mount = (id, onPick) => {
        const current = consoleOf(id)
        const map = effectiveMap(defaultMap(id), normalizeOverrides(null))
        return render(<K2LayoutPanel map={map} monitor={createK2Monitor()} console={current} onPickConsole={onPick} onClose={() => {}} />)
    }
    it('on K2 (1.9): title, both names in the switch, fader 4 reads not used, pot 12 and encoder 3 read what they do', () => {
        const onPick = vi.fn()
        mount('k2-1.9', onPick)
        expect(document.querySelector('.k2-panel-title').textContent).toBe('K2 (1.9)')
        const group = screen.getByRole('group', { name: 'K2 console' })
        const items = Array.from(group.querySelectorAll('button'))
        expect(items.map((b) => b.textContent)).toEqual(['K2', 'K2 (1.9)'])
        expect(items.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
        expect(screen.getByLabelText('fader 4: not used')).toBeTruthy()
        expect(screen.getByLabelText('pot 12: Layer 4 level')).toBeTruthy()
        expect(screen.getByLabelText(/^encoder 3: .*(fx|Fx|effect|param).*/i)).toBeTruthy()
        fireEvent.click(items[0])
        expect(onPick).toHaveBeenCalledWith('k2')
    })
    it('on K2: title K2 and fader 4 reads Layer 4 level', () => {
        mount('k2')
        expect(document.querySelector('.k2-panel-title').textContent).toBe('K2')
        expect(screen.getByLabelText('fader 4: Layer 4 level')).toBeTruthy()
    })
    it('the deck state text shows the console name with a K2 connected', () => {
        const midi = (id) => ({ state: 'k2', k2Console: consoleOf(id), deviceName: 'XONE:K2 MIDI 1', learning: false, bindings: 0 })
        const view = render(<DeckMidiControl midi={midi('k2-1.9')} />)
        expect(screen.getByRole('status').textContent).toBe('K2 (1.9)')
        view.rerender(<DeckMidiControl midi={midi('k2')} />)
        expect(screen.getByRole('status').textContent).toBe('K2')
        view.rerender(<DeckMidiControl midi={{ ...midi('k2'), state: 'absent' }} />)
        expect(screen.getByRole('status').textContent).toBe('no controller')
    })
})
