import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('../../../project/tops/machineDevices.js', async (original) => ({
    ...(await original()),
    readNdiSources: vi.fn()
}))

const { readNdiSources } = await import('../../../project/tops/machineDevices.js')
const { default: VjDeckView, DRAG_SOURCE } = await import('./VjDeckView.jsx')
const { createDeck } = await import('../../../project/tops/vjDeck.js')

function Host({ onValues = () => {} }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: createDeck() } })
    return (
        <VjDeckView
            node={node}
            placement="perform"
            assets={[{ id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm' }]}
            onPatchValues={(patch) => setNode((current) => {
                const next = { ...current, values: { ...current.values, ...patch } }
                onValues(next.values)
                return next
            })}
        />
    )
}
const transfer = () => {
    const data = {}
    return { data, types: [], setData(type, value) { data[type] = value; this.types = Object.keys(data) }, getData: (type) => data[type] || '', effectAllowed: '', dropEffect: '' }
}
const setMedia = (value) => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value })
const sources = () => screen.getByRole('region', { name: 'Sources' })
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

afterEach(() => {
    cleanup()
    delete navigator.mediaDevices
    readNdiSources.mockReset()
})

describe('the Sources panel', () => {
    it('lists the groups in the order DEVICES, NETWORK, INPUTS, FILES', async () => {
        readNdiSources.mockResolvedValue([])
        render(<Host />)
        await settle()
        const heads = [...sources().querySelectorAll('.vj-deck-source-head')].map((el) => el.textContent.toUpperCase())
        expect(heads).toEqual(['DEVICES', 'NETWORK', 'INPUTS', 'FILES'])
    })

    it('shows NDI sources as rows that cannot be played or dragged yet', async () => {
        readNdiSources.mockResolvedValue([{ label: 'STUDIO (Camera 1)' }])
        render(<Host />)
        await settle()
        const name = within(sources()).getByRole('button', { name: 'NDI STUDIO (Camera 1)' })
        expect(name.disabled).toBe(true)
        const row = name.closest('.vj-deck-source')
        expect(row.getAttribute('draggable')).toBe('false')
        expect(row.textContent).toMatch(/Not on deck yet/)
        const dt = transfer()
        fireEvent.dragStart(row, { dataTransfer: dt })
        expect(dt.data[DRAG_SOURCE]).toBeUndefined()
    })

    it('a device row is dragged with its camera clip and lands in an empty slot', async () => {
        readNdiSources.mockResolvedValue([])
        setMedia({
            enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: 'Phone' }],
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        })
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        await settle()
        const row = within(sources()).getByRole('button', { name: 'Camera Phone' }).closest('.vj-deck-source')
        expect(row.getAttribute('draggable')).toBe('true')
        const dt = transfer()
        fireEvent.dragStart(row, { dataTransfer: dt })
        expect(JSON.parse(dt.data[DRAG_SOURCE])).toMatchObject({ kind: 'camera', camera: 'Phone', device: 'd1' })
        const slot = screen.getByRole('button', { name: /^Layer 1, slot 2:/ })
        fireEvent.dragOver(slot, { dataTransfer: dt })
        fireEvent.drop(slot, { dataTransfer: dt })
        expect(onValues.mock.calls.at(-1)[0].deck.layers[0].clips[1]).toMatchObject({ kind: 'camera', camera: 'Phone' })
    })
})
