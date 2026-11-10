import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setClip, trigger } from '../../../project/tops/vjDeck.js'

function Host({ initialDeck = createDeck(), onValues = () => {} }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return (
        <VjDeckView
            node={node}
            placement="perform"
            onPatchValues={(patch) => setNode((current) => {
                const next = { ...current, values: { ...current.values, ...patch } }
                onValues(next.values)
                return next
            })}
        />
    )
}
const lastDeck = (spy) => spy.mock.calls.at(-1)[0].deck

const setMedia = (value) => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value })
afterEach(() => {
    cleanup()
    delete navigator.mediaDevices
})

const openPicker = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: add a clip' }))
    await act(async () => {})
    return screen.getByRole('region', { name: 'Add a clip' })
}

describe('VjDeckView cameras', () => {
    it('lists the video inputs by label and picking one patches the deck', async () => {
        const listeners = {}
        setMedia({
            enumerateDevices: async () => [
                { kind: 'videoinput', deviceId: 'd1', label: 'Phone' },
                { kind: 'audioinput', deviceId: 'a1', label: 'Mic' },
                { kind: 'videoinput', deviceId: 'd2', label: 'Webcam' }
            ],
            addEventListener: (name, fn) => { listeners[name] = fn },
            removeEventListener: vi.fn()
        })
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        const picker = await openPicker()
        const group = within(picker).getByRole('group', { name: 'Cameras' })
        expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Phone', 'Webcam'])
        expect(listeners.devicechange).toBeTypeOf('function')
        fireEvent.click(within(group).getByRole('button', { name: 'Camera Phone' }))
        expect(lastDeck(onValues).layers[0].clips[0]).toMatchObject({ kind: 'camera', camera: 'Phone', device: 'd1', label: 'Phone' })
        expect(screen.getByRole('region', { name: 'Clip settings' })).toBeTruthy()
    })

    it('re-lists on devicechange', async () => {
        let devices = [{ kind: 'videoinput', deviceId: 'd1', label: 'Phone' }]
        const listeners = {}
        setMedia({ enumerateDevices: async () => devices, addEventListener: (n, f) => { listeners[n] = f }, removeEventListener: () => {} })
        render(<Host />)
        const picker = await openPicker()
        expect(within(picker).queryByRole('button', { name: 'Camera Cam B' })).toBeNull()
        devices = [...devices, { kind: 'videoinput', deviceId: 'd9', label: 'Cam B' }]
        await act(async () => { listeners.devicechange() })
        expect(within(picker).getByRole('button', { name: 'Camera Cam B' })).toBeTruthy()
    })

    it('empty labels show Allow cameras, which asks once, stops the tracks and re-lists', async () => {
        let allowed = false
        const stop = vi.fn()
        const getUserMedia = vi.fn(async () => { allowed = true; return { getTracks: () => [{ stop }] } })
        setMedia({
            enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: allowed ? 'Phone' : '' }],
            getUserMedia
        })
        render(<Host />)
        const picker = await openPicker()
        fireEvent.click(within(picker).getByRole('button', { name: 'Allow cameras' }))
        await act(async () => {})
        expect(getUserMedia).toHaveBeenCalledTimes(1)
        expect(getUserMedia).toHaveBeenCalledWith({ video: true })
        expect(stop).toHaveBeenCalledTimes(1)
        expect(within(picker).getByRole('button', { name: 'Camera Phone' })).toBeTruthy()
        expect(within(picker).queryByRole('button', { name: 'Allow cameras' })).toBeNull()
    })

    it('a refused permission says so and offers the button again', async () => {
        setMedia({ enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: '' }], getUserMedia: async () => { throw new Error('denied') } })
        render(<Host />)
        const picker = await openPicker()
        fireEvent.click(within(picker).getByRole('button', { name: 'Allow cameras' }))
        await act(async () => {})
        expect(within(picker).getByRole('status').textContent).toBe('Could not open the camera.')
        expect(within(picker).getByRole('button', { name: 'Allow cameras' })).toBeTruthy()
    })

    it.each([
        ['NotReadableError', /busy in another program/],
        ['TrackStartError', /busy in another program/],
        ['AbortError', /busy in another program/],
        ['NotFoundError', /No camera on this machine/],
        ['NotAllowedError', /blocked for this page/],
        ['OverconstrainedError', /Could not open the camera\./]
    ])('%s says the right thing', async (name, text) => {
        setMedia({ enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: '' }], getUserMedia: async () => { throw Object.assign(new Error(name), { name }) } })
        render(<Host />)
        const picker = await openPicker()
        fireEvent.click(within(picker).getByRole('button', { name: 'Allow cameras' }))
        await act(async () => {})
        expect(within(picker).getByRole('status').textContent).toMatch(text)
    })

    // 2026-11-10 (owner row N3529): the laptop camera was held by another program, so
    // the open failed although the person had said yes; the phone was never listed.
    it('a busy default camera still lists the cameras once the person allowed', async () => {
        let asked = false
        setMedia({
            enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: asked ? 'Phone' : '' }],
            getUserMedia: async () => { asked = true; throw Object.assign(new Error('busy'), { name: 'NotReadableError' }) }
        })
        render(<Host />)
        const picker = await openPicker()
        fireEvent.click(within(picker).getByRole('button', { name: 'Allow cameras' }))
        await act(async () => {})
        expect(within(picker).getByRole('button', { name: 'Camera Phone' })).toBeTruthy()
        expect(within(picker).queryByRole('status')).toBeNull()
    })

    it('a blocked permission says where to allow it', async () => {
        setMedia({ enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: '' }], getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }) } })
        render(<Host />)
        const picker = await openPicker()
        fireEvent.click(within(picker).getByRole('button', { name: 'Allow cameras' }))
        await act(async () => {})
        expect(within(picker).getByRole('status').textContent).toMatch(/blocked for this page/)
    })

    it('no mediaDevices: one quiet line, no throw', async () => {
        delete navigator.mediaDevices
        render(<Host />)
        const picker = await openPicker()
        expect(within(picker).getByText('No camera on this machine')).toBeTruthy()
        expect(within(picker).queryByRole('button', { name: 'Allow cameras' })).toBeNull()
    })

    it('a camera clip names itself, shows its camera and only Remove in the CLIP panel', () => {
        const deck = setClip(createDeck(), 0, 0, { id: 'c1', kind: 'camera', camera: 'Phone', device: 'd1', label: 'Phone' })
        const onValues = vi.fn()
        render(<Host initialDeck={deck} onValues={onValues} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: Phone' }))
        const panel = screen.getByRole('region', { name: 'Clip settings' })
        expect(within(panel).getByText('Camera: Phone')).toBeTruthy()
        expect(within(panel).queryByLabelText('Speed')).toBeNull()
        expect(within(panel).queryByLabelText('In point')).toBeNull()
        expect(within(panel).queryByRole('radiogroup')).toBeNull()
        fireEvent.click(within(panel).getByRole('button', { name: 'Remove clip' }))
        expect(lastDeck(onValues).layers[0].clips[0]).toBeNull()
    })

    it('PREVIEW of a selected camera clip that is not playing says its name and "not playing" without a device', () => {
        const deck = setClip(createDeck(), 0, 0, { id: 'c1', kind: 'camera', camera: 'Phone', label: 'Phone' })
        render(<Host initialDeck={deck} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: Phone' }))
        // the tap plays it, so stop it: clear the layer
        fireEvent.click(screen.getByRole('button', { name: 'Clear Layer 1' }))
        const monitor = document.querySelector('.vj-deck-monitor--preview')
        expect(monitor.textContent).toMatch(/Phone/)
        expect(monitor.textContent).toMatch(/not playing/)
    })

    it('a playing camera clip hands its canvas to the runner under the shared camera id', () => {
        const deck = trigger(setClip(createDeck(), 0, 0, { id: 'c1', kind: 'camera', camera: 'Phone', label: 'Phone' }), 0, 0)
        render(<Host initialDeck={deck} />)
        expect(screen.getAllByRole('img', { name: 'Phone' }).length).toBeGreaterThan(0)
    })

    it('the side picker reads A/B –, A, B and is named for its layer', () => {
        render(<Host />)
        const side = screen.getByLabelText('Crossfader side for Layer 2')
        expect([...side.options].map((o) => o.textContent)).toEqual(['A/B –', 'A', 'B'])
    })

    describe('the private PREVIEW of a camera clip that is not playing', () => {
        const twoCams = () => {
            const streams = []
            setMedia({
                enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'd1', label: 'Phone' }, { kind: 'videoinput', deviceId: 'd2', label: 'Webcam' }],
                getUserMedia: vi.fn(async () => {
                    const track = { stop: vi.fn() }
                    const stream = { track, getTracks: () => [track] }
                    streams.push(stream)
                    return stream
                }),
                addEventListener: () => {},
                removeEventListener: () => {}
            })
            let deck = setClip(createDeck(), 0, 0, { id: 'c1', kind: 'camera', camera: 'Phone', device: 'd1', label: 'Phone' })
            deck = setClip(deck, 0, 1, { id: 'c2', kind: 'camera', camera: 'Webcam', device: 'd2', label: 'Webcam' })
            return { streams, deck }
        }
        const selectNotPlaying = async (name) => {
            fireEvent.click(screen.getByRole('button', { name: `Layer 1, slot ${name === 'Phone' ? 1 : 2}: ${name}` }))
            fireEvent.click(screen.getByRole('button', { name: 'Clear Layer 1' }))
            await act(async () => {})
        }

        it('stops its stream when the clip changes and when the deck goes away', async () => {
            const { streams, deck } = twoCams()
            const { unmount } = render(<Host initialDeck={deck} />)
            await selectNotPlaying('Phone')
            expect(streams).toHaveLength(1)
            expect(streams[0].track.stop).not.toHaveBeenCalled()
            await selectNotPlaying('Webcam')
            expect(streams[0].track.stop).toHaveBeenCalledTimes(1) // the first clip's stream is stopped
            expect(streams).toHaveLength(2)
            expect(streams[1].track.stop).not.toHaveBeenCalled()
            unmount()
            expect(streams[1].track.stop).toHaveBeenCalledTimes(1)
        })
    })
})
