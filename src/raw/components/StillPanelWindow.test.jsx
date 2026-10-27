import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StillPanelWindow from './StillPanelWindow.jsx'

const node = { id: 'still-1', typeId: 'stream.still', values: {} }
const AT = new Date('2026-10-21T14:03:07Z')
const picture = { image: { videoWidth: 4, videoHeight: 3 } }

// The canvas is faked at its boundary: what was drawn, and a PNG out of toBlob.
const fakeCanvas = () => {
    const drawn = []
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (...args) => drawn.push(args) }),
        toBlob: (done, type) => done(new Blob(['png-bytes'], { type })),
        drawn,
    }
    return canvas
}

const setup = (props = {}) => {
    const canvases = []
    const onSave = props.onSave || vi.fn(async (_id, file) => ({ id: 'a1', name: file.name }))
    const onReport = vi.fn()
    const view = render(
        <StillPanelWindow
            node={node}
            sourceLabel="Scene"
            values={{ picture }}
            onSave={onSave}
            onReport={onReport}
            createCanvas={() => { const c = fakeCanvas(); canvases.push(c); return c }}
            now={() => AT}
            {...props}
        />
    )
    return { ...view, onSave, onReport, canvases }
}

describe('StillPanelWindow', () => {
    it('Take saves one PNG of the picture, named after its source and date', async () => {
        const { onSave, onReport, canvases } = setup()
        fireEvent.click(screen.getByRole('button', { name: 'Take' }))
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
        const [nodeId, file] = onSave.mock.calls[0]
        expect(nodeId).toBe('still-1')
        expect(file.name).toBe('still-scene-2026-10-21T14-03-07.png')
        expect(file.type).toBe('image/png')
        expect(file.size).toBe('png-bytes'.length)
        expect(canvases[0]).toMatchObject({ width: 4, height: 3 })
        expect(canvases[0].drawn).toHaveLength(1)
        await waitFor(() => expect(onReport).toHaveBeenLastCalledWith('still-1', {
            status: 'Saved still-scene-2026-10-21T14-03-07.png.',
            file: 'still-scene-2026-10-21T14-03-07.png',
        }))
        expect(screen.getByRole('status').textContent).toBe('Saved still-scene-2026-10-21T14-03-07.png.')
    })

    it('a rising Take takes once; holding it high takes no more', async () => {
        const { onSave, rerender } = setup()
        const at = (take) => (
            <StillPanelWindow node={node} sourceLabel="Scene" values={{ picture, take }} onSave={onSave}
                createCanvas={fakeCanvas} now={() => AT} />
        )
        rerender(at(true))
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
        rerender(at(true))
        rerender(at(1))
        await act(async () => {})
        expect(onSave).toHaveBeenCalledTimes(1)
        rerender(at(false))
        rerender(at(true))
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
    })

    it('takes nothing and says so when no picture is arriving', async () => {
        const { onSave, onReport } = setup({ values: {} })
        fireEvent.click(screen.getByRole('button', { name: 'Take' }))
        await act(async () => {})
        expect(onSave).not.toHaveBeenCalled()
        expect(onReport).toHaveBeenLastCalledWith('still-1', { status: 'No picture is arriving — nothing taken.', file: '' })
        expect(screen.getByText(/Wire a picture into Picture/)).toBeTruthy()
    })

    it('takes nothing from a picture with no frame yet', async () => {
        const { onSave } = setup({ values: { picture: { image: { videoWidth: 0, videoHeight: 0 } } } })
        fireEvent.click(screen.getByRole('button', { name: 'Take' }))
        await act(async () => {})
        expect(onSave).not.toHaveBeenCalled()
        expect(screen.getByRole('status').textContent).toContain('no frame yet')
    })

    it('says it could not save when the upload fails, and keeps no file name', async () => {
        const { onReport } = setup({ onSave: vi.fn(async () => { throw new Error('413') }) })
        fireEvent.click(screen.getByRole('button', { name: 'Take' }))
        await waitFor(() => expect(onReport).toHaveBeenLastCalledWith('still-1', {
            status: 'Could not save still-scene-2026-10-21T14-03-07.png.',
            file: '',
        }))
    })
})
