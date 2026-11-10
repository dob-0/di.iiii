import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setBypass, setClip, setSolo, trigger } from '../../../project/tops/vjDeck.js'
import { topThumbnailTargets } from '../../../project/tops/topThumbnails.js'

const assets = [
    { id: 'asset-dusk', name: 'dusk_01.mp4', mimeType: 'video/mp4' },
    { id: 'asset-still', name: 'poster.png', mimeType: 'image/png' },
    { id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm' }
]

// The deck as a host holds it: node.values patched in place, like applyLocalOps.
function Host({ initialDeck = createDeck(), placement = 'window', onValues = () => {}, now, onUploadFile }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return (
        <VjDeckView
            node={node}
            assets={assets}
            placement={placement}
            now={now}
            onUploadFile={onUploadFile}
            onPatchValues={(patch) => {
                setNode((current) => {
                    const next = { ...current, values: { ...current.values, ...patch } }
                    onValues(next.values)
                    return next
                })
            }}
        />
    )
}

const lastDeck = (spy) => spy.mock.calls.at(-1)[0].deck

describe('VjDeckView', () => {
    it('draws the column row, then the grid top layer first', () => {
        render(<Host />)
        const rows = screen.getAllByRole('group').map((row) => row.getAttribute('aria-label'))
        expect(rows).toEqual(['Columns', 'Layer 3', 'Layer 2', 'Layer 1'])
        expect(screen.getAllByRole('button', { name: /slot \d+/ })).toHaveLength(18)
        expect(screen.getByRole('button', { name: 'Play column 6' })).toBeTruthy()
        expect(screen.getByLabelText('Tempo').textContent).toBe('120.0')
    })

    it('an empty slot opens the picker: video assets only, and the four inputs', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 2: add a clip' }))
        const picker = screen.getByRole('region', { name: 'Add a clip' })
        expect(within(picker).getByRole('button', { name: 'dusk_01.mp4' })).toBeTruthy()
        expect(within(picker).getByRole('button', { name: 'rain.webm' })).toBeTruthy()
        expect(within(picker).queryByRole('button', { name: 'poster.png' })).toBeNull()
        expect(within(picker).getByRole('button', { name: 'In 4' })).toBeTruthy()

        fireEvent.click(within(picker).getByRole('button', { name: 'rain.webm' }))
        const deck = lastDeck(onValues)
        expect(deck.layers[0].clips[1]).toMatchObject({ kind: 'asset', asset: 'asset-rain', label: 'rain.webm', speed: 1, mode: '0' })
        // The picker closes and the new clip's settings open.
        expect(screen.queryByRole('region', { name: 'Add a clip' })).toBeNull()
        expect(screen.getByRole('region', { name: 'Clip settings' })).toBeTruthy()
    })

    it('tapping a clip plays it on its layer, and again restarts it', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} initialDeck={setClip(createDeck(), 2, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk', label: 'dusk' })} />)
        const tile = screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' })
        expect(tile.getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(tile)
        expect(lastDeck(onValues).layers[2]).toMatchObject({ active: 0, trigger: 1 })
        expect(screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' }))
        expect(lastDeck(onValues).layers[2].trigger).toBe(2)
        fireEvent.click(screen.getByRole('button', { name: 'Clear Layer 3' }))
        expect(lastDeck(onValues).layers[2].active).toBe(-1)
    })

    it('a playing asset clip hands its canvas to the picture runner under the expanded id', () => {
        const deck = trigger(setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' }), 0, 0)
        const { unmount } = render(<Host initialDeck={deck} />)
        // jsdom has no 2D context, so the registration is a no-op there — the
        // canvases are what must exist, named for what they will show.
        expect(screen.getByRole('img', { name: 'dusk_01.mp4' })).toBeTruthy()
        expect(screen.getByRole('img', { name: 'Deck output' })).toBeTruthy()
        unmount()
        expect([...topThumbnailTargets().keys()].some((id) => id.startsWith('deck-1'))).toBe(false)
    })

    it('opacity, blend, master and column trigger write the deck', () => {
        const onValues = vi.fn()
        let deck = setClip(createDeck(), 0, 3, { id: 'a', kind: 'input', input: 'in1' })
        deck = setClip(deck, 1, 3, { id: 'b', kind: 'asset', asset: 'asset-dusk' })
        render(<Host onValues={onValues} initialDeck={deck} />)
        fireEvent.change(screen.getByLabelText('Layer 2 opacity'), { target: { value: '0.3' } })
        expect(lastDeck(onValues).layers[1].opacity).toBe(0.3)
        fireEvent.change(screen.getByLabelText('Layer 2 blend'), { target: { value: '4' } })
        expect(lastDeck(onValues).layers[1].blend).toBe('4')
        fireEvent.change(screen.getByLabelText('Master'), { target: { value: '0.5' } })
        expect(lastDeck(onValues).master).toBe(0.5)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 4' }))
        expect(lastDeck(onValues).layers.map((layer) => layer.active)).toEqual([3, 3, -1])
    })

    it('tap tempo sets the bpm from the taps', () => {
        const onValues = vi.fn()
        const times = [1000, 1500, 2000]
        render(<Host onValues={onValues} now={() => times.shift()} />)
        const tap = screen.getByRole('button', { name: 'Tap' })
        fireEvent.click(tap)
        expect(onValues).not.toHaveBeenCalled()
        fireEvent.click(tap)
        fireEvent.click(tap)
        expect(lastDeck(onValues).bpm).toBe(120)
        expect(screen.getByLabelText('Tempo').textContent).toBe('120.0')
    })

    it('clip settings change speed, mode and in/out; remove empties the slot', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
        const settings = screen.getByRole('region', { name: 'Clip settings' })
        fireEvent.change(within(settings).getByLabelText('Speed'), { target: { value: '2.5' } })
        expect(lastDeck(onValues).layers[0].clips[0].speed).toBe(2.5)
        fireEvent.click(within(settings).getByRole('radio', { name: 'Bounce' }))
        expect(lastDeck(onValues).layers[0].clips[0].mode).toBe('1')
        expect(within(settings).getByRole('radio', { name: 'Bounce' }).getAttribute('aria-checked')).toBe('true')
        fireEvent.change(within(settings).getByLabelText('In point'), { target: { value: '0.25' } })
        fireEvent.change(within(settings).getByLabelText('Out point'), { target: { value: '0.75' } })
        expect(lastDeck(onValues).layers[0].clips[0]).toMatchObject({ in: 0.25, out: 0.75 })
        fireEvent.click(within(settings).getByRole('button', { name: 'Remove clip' }))
        expect(lastDeck(onValues).layers[0].clips[0]).toBeNull()
        expect(screen.queryByRole('region', { name: 'Clip settings' })).toBeNull()
    })

    it('clip settings show without a Settings click, and say "Select a clip" when none is selected', () => {
        // The panel sits under the grid (CLIP), so a tap never covers the grid.
        render(<Host initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
        expect(screen.queryByRole('region', { name: 'Clip settings' })).toBeNull()
        expect(within(screen.getByRole('region', { name: 'Clip' })).getByText('Select a clip')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
        const settings = screen.getByRole('region', { name: 'Clip settings' })
        expect(within(settings).getByText('dusk_01.mp4')).toBeTruthy()
        expect(within(settings).getByLabelText('Speed')).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' })).toBeTruthy()
    })

    it('B toggles bypass and S toggles solo on the layer they sit on', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        const bypass = screen.getByRole('button', { name: 'Bypass Layer 2' })
        const solo = screen.getByRole('button', { name: 'Solo Layer 3' })
        expect(bypass.getAttribute('aria-pressed')).toBe('false')
        expect(bypass.getAttribute('title')).toBe('Bypass layer')
        expect(solo.getAttribute('title')).toBe('Solo layer')
        fireEvent.click(bypass)
        expect(lastDeck(onValues).layers.map((layer) => layer.bypass)).toEqual([false, true, false])
        expect(screen.getByRole('button', { name: 'Bypass Layer 2' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('group', { name: 'Layer 2' }).getAttribute('data-bypass')).toBe('true')
        fireEvent.click(solo)
        expect(lastDeck(onValues).layers.map((layer) => layer.solo)).toEqual([false, false, true])
        fireEvent.click(screen.getByRole('button', { name: 'Solo Layer 3' }))
        expect(lastDeck(onValues).layers[2].solo).toBe(false)
    })

    it('B and S show what the deck holds', () => {
        const base = createDeck()
        render(<Host initialDeck={setSolo(setBypass(base, base.layers[0].id, true), base.layers[1].id, true)} />)
        expect(screen.getByRole('button', { name: 'Bypass Layer 1' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'Solo Layer 2' }).getAttribute('aria-pressed')).toBe('true')
        expect(screen.getByRole('button', { name: 'Solo Layer 1' }).getAttribute('aria-pressed')).toBe('false')
    })

    it('the side select puts a layer on A or B, and the crossfader writes the crossfade', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        fireEvent.change(screen.getByLabelText('Crossfader side for Layer 1'), { target: { value: 'b' } })
        expect(lastDeck(onValues).layers.map((layer) => layer.side)).toEqual(['b', '', ''])
        fireEvent.change(screen.getByLabelText('Crossfader side for Layer 1'), { target: { value: '' } })
        expect(lastDeck(onValues).layers[0].side).toBe('')
        fireEvent.change(screen.getByLabelText('Crossfader'), { target: { value: '0.8' } })
        expect(lastDeck(onValues).crossfade).toBe(0.8)
    })

    it('PREVIEW and OUTPUT monitors render; preview says "Select a clip" until one is selected', () => {
        const { container } = render(<Host initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
        const preview = container.querySelector('.vj-deck-monitor--preview')
        const output = container.querySelector('.vj-deck-monitor--output')
        expect(within(preview).getByText('Preview')).toBeTruthy()
        expect(within(output).getByText('Output')).toBeTruthy()
        expect(within(preview).getByText('Select a clip')).toBeTruthy()
        expect(within(output).getByRole('img', { name: 'Deck output' })).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
        expect(within(preview).queryByText('Select a clip')).toBeNull()
        // The clip now plays, so PREVIEW draws its live canvas.
        expect(within(preview).getByRole('img', { name: 'Preview of dusk_01.mp4' })).toBeTruthy()
    })

    it('a playing input tile shows the picture of the node wired into that input', () => {
        const deck = trigger(setClip(createDeck(), 0, 0, { id: 'c1', kind: 'input', input: 'in2', label: 'cam' }), 0, 0)
        render(
            <VjDeckView
                node={{ id: 'deck-1', typeId: 'vj.deck', values: { deck } }}
                assets={assets}
                inputSources={{ in2: 'clip-node-7' }}
                onPatchValues={() => {}}
            />
        )
        expect(screen.getByRole('img', { name: 'cam' })).toBeTruthy()
    })

    it('an upload lands in the slot it was picked for', async () => {
        const onValues = vi.fn()
        const onUploadFile = vi.fn(async (file) => ({ id: 'asset-new', name: file.name }))
        render(<Host onValues={onValues} onUploadFile={onUploadFile} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 2, slot 3: add a clip' }))
        const input = screen.getByLabelText('Upload video')
        const file = new File(['x'], 'fresh.mp4', { type: 'video/mp4' })
        fireEvent.change(input, { target: { files: [file] } })
        await vi.waitFor(() => expect(onUploadFile).toHaveBeenCalledWith(file))
        await vi.waitFor(() => expect(lastDeck(onValues).layers[1].clips[2]).toMatchObject({ asset: 'asset-new', label: 'fresh.mp4' }))
    })

    it('a slow upload places its clip into the LATEST deck, keeping what changed meanwhile', async () => {
        const onValues = vi.fn()
        let finish
        const onUploadFile = vi.fn(() => new Promise((resolve) => { finish = resolve }))
        render(<Host onValues={onValues} onUploadFile={onUploadFile} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 2, slot 3: add a clip' }))
        const file = new File(['x'], 'slow.mp4', { type: 'video/mp4' })
        fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [file] } })
        await vi.waitFor(() => expect(onUploadFile).toHaveBeenCalled())
        // while the file travels: the master moves and another layer is bypassed
        fireEvent.change(screen.getByLabelText('Master'), { target: { value: '0.3' } })
        fireEvent.click(screen.getByRole('button', { name: /Bypass Layer 1|Layer 1 bypass/i }))
        const before = lastDeck(onValues)
        expect(before.master).toBeCloseTo(0.3)
        expect(before.layers[0].bypass).toBe(true)
        finish({ id: 'asset-slow', name: 'slow.mp4' })
        await vi.waitFor(() => expect(lastDeck(onValues).layers[1].clips[2]).toMatchObject({ asset: 'asset-slow' }))
        const after = lastDeck(onValues)
        expect(after.master).toBeCloseTo(0.3)
        expect(after.layers[0].bypass).toBe(true)
    })

    // 2026-11-10 (owner row N3529): a video over the server's limit said only "could not".
    it('a file the server refuses as too large says so, with its size', async () => {
        const onUploadFile = vi.fn(async () => { throw Object.assign(new Error('too large'), { status: 413 }) })
        render(<Host onUploadFile={onUploadFile} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 2, slot 3: add a clip' }))
        const file = new File(['x'], 'big.mp4', { type: 'video/mp4' })
        Object.defineProperty(file, 'size', { value: 250 * 1024 * 1024 })
        fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [file] } })
        await vi.waitFor(() => expect(screen.getByText(/big\.mp4: the server refused it for size/)).toBeTruthy())
    })

    it('a 413 that carries maxBytes names the limit; other failures show their message', async () => {
        const onUploadFile = vi.fn()
            .mockRejectedValueOnce(Object.assign(new Error('too large'), { status: 413, maxBytes: 100 * 1024 * 1024 }))
            .mockRejectedValueOnce(new Error('disk full'))
        render(<Host onUploadFile={onUploadFile} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 2, slot 3: add a clip' }))
        const file = new File(['x'], 'big.mp4', { type: 'video/mp4' })
        fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [file] } })
        await vi.waitFor(() => expect(screen.getByText(/big\.mp4 is too large: this di takes 100 MB/)).toBeTruthy())
        fireEvent.change(screen.getByLabelText('Upload video'), { target: { files: [file] } })
        await vi.waitFor(() => expect(screen.getByText(/Could not bring in big\.mp4: disk full/)).toBeTruthy())
    })

    // Audit 2026-11-10: handlers built from the render-time deck; two edits in one frame lost one.
    it('two edits before the host re-renders both land', () => {
        const patches = []
        const deck = setClip(createDeck(), 0, 1, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })
        render(<VjDeckView node={{ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck } }} assets={assets} onPatchValues={(p) => patches.push(p)} />)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 2' }))
        fireEvent.click(screen.getByRole('button', { name: 'Bypass Layer 1' }))
        const last = patches.at(-1).deck
        expect(last.layers[0].bypass).toBe(true)
        expect(last.layers[0].active).toBe(1)
    })

    it('every placement behaves the same; only the density class differs', () => {
        for (const placement of ['window', 'inside', 'perform']) {
            const onValues = vi.fn()
            const { container, unmount } = render(<Host placement={placement} onValues={onValues} initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
            expect(container.querySelector(`.vj-deck--${placement}`)).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
            expect(lastDeck(onValues).layers[0]).toMatchObject({ active: 0, trigger: 1 })
            unmount()
        }
    })

    it('without a writer nothing pretends to be live', () => {
        render(<VjDeckView node={{ id: 'd', typeId: 'vj.deck', values: {} }} assets={assets} />)
        expect(screen.getByRole('button', { name: 'Tap' }).disabled).toBe(true)
        expect(screen.getByRole('button', { name: 'Layer 1, slot 1: add a clip' }).disabled).toBe(true)
        expect(screen.getAllByRole('button', { name: /slot \d+/ })).toHaveLength(18)
    })
})
