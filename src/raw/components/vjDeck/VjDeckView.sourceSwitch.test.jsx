import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('../../../project/tops/machineDevices.js', async (original) => ({
    ...(await original()),
    readNdiSources: vi.fn()
}))

const { readNdiSources } = await import('../../../project/tops/machineDevices.js')
const { default: VjDeckView } = await import('./VjDeckView.jsx')
const { createDeck } = await import('../../../project/tops/vjDeck.js')
const { SOURCES_OFF_KEY, resetSourcesOffForTest } = await import('../../../project/tops/sourceSwitch.js')
const { TURN_OFF_TITLE, TURN_ON_TITLE } = await import('./SourceSwitch.jsx')

const node = { id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } }
const setMedia = (value) => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value })
const sources = () => screen.getByRole('region', { name: 'Sources' })
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
const mount = async () => {
    readNdiSources.mockResolvedValue([{ label: 'STUDIO' }])
    setMedia({ enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: 'Phone' }], addEventListener: vi.fn(), removeEventListener: vi.fn() })
    render(<VjDeckView node={node} placement="perform" assets={[{ id: 'a1', name: 'rain.webm', mimeType: 'video/webm' }]} onPatchValues={() => {}} onUploadFile={() => {}} />)
    await settle()
}
const switches = () => [...sources().querySelectorAll('.vj-deck-source-switch')]

beforeEach(() => { localStorage.clear(); resetSourcesOffForTest() })
afterEach(() => { cleanup(); delete navigator.mediaDevices; readNdiSources.mockReset(); localStorage.clear(); resetSourcesOffForTest() })

describe('the switch on the Sources rows', () => {
    it('is a pressed toggle button on every Devices, Network and Inputs row and on no Files row', async () => {
        await mount()
        const inGroup = (name) => sources().querySelector(`.vj-deck-source-${name}`).querySelectorAll('button.vj-deck-source-switch')
        expect(inGroup('devices')).toHaveLength(1)
        expect(inGroup('network')).toHaveLength(1)
        expect(inGroup('inputs')).toHaveLength(4)
        expect(inGroup('files')).toHaveLength(0)
        for (const button of switches()) {
            expect(button.tagName).toBe('BUTTON')
            expect(button.getAttribute('type')).toBe('button')
            expect(button.getAttribute('aria-pressed')).toBe('true')
            expect(button.getAttribute('title')).toBe(TURN_OFF_TITLE)
        }
        expect(TURN_ON_TITLE).toBe('Turn on: the deck uses this source again')
    })

    it('a press turns the source off: aria-pressed follows, the row reads Off, the state is stored', async () => {
        await mount()
        const button = within(sources()).getByRole('button', { name: 'Use Phone' })
        fireEvent.click(button)
        expect(button.getAttribute('aria-pressed')).toBe('false')
        expect(button.getAttribute('title')).toBe(TURN_ON_TITLE)
        const row = button.closest('.vj-deck-source')
        expect(row.classList.contains('is-source-off')).toBe(true)
        expect(row.textContent).toMatch(/Off/)
        expect(JSON.parse(localStorage.getItem(SOURCES_OFF_KEY))).toEqual({ v: 1, off: ['camera:Phone'] })
        expect(within(sources()).getByRole('button', { name: 'Use In 2' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(button)
        expect(button.getAttribute('aria-pressed')).toBe('true')
        expect(localStorage.getItem(SOURCES_OFF_KEY)).toBeNull()
    })

    it('a stored off state shows after mount, for a camera, an input and a network source', async () => {
        localStorage.setItem(SOURCES_OFF_KEY, JSON.stringify({ v: 1, off: ['camera:Phone', 'input:in1', 'ndi:STUDIO'] }))
        await mount()
        const off = switches().filter((button) => button.getAttribute('aria-pressed') === 'false')
        expect(off).toHaveLength(3)
        expect(off.every((button) => button.closest('.vj-deck-source').classList.contains('is-source-off'))).toBe(true)
    })

    it('another page of this browser changes it through the storage event', async () => {
        await mount()
        localStorage.setItem(SOURCES_OFF_KEY, JSON.stringify({ v: 1, off: ['input:in3'] }))
        await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: SOURCES_OFF_KEY })) })
        expect(within(sources()).getByRole('button', { name: 'Use In 3' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('a broken stored value means everything is on', async () => {
        localStorage.setItem(SOURCES_OFF_KEY, '{"v":9,"off":["camera:Phone"]}')
        await mount()
        expect(switches().every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true)
    })
})
