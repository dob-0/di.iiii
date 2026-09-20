import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../project/services/projectsApi.js', () => ({
    uploadProjectAsset: vi.fn()
}))

import MapInspector from './MapInspector.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'
import { uploadProjectAsset } from '../project/services/projectsApi.js'

const surfaceOf = (source) => normalizeMappingSurface({ id: 's1', name: 'Wall', resolution: [640, 360], source })

const baseProps = (overrides = {}) => ({
    projectOptions: [],
    onUpdate: vi.fn(),
    onUpsertAsset: vi.fn(),
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onCopy: vi.fn(),
    onPasteShape: vi.fn(),
    onPasteLook: vi.fn(),
    onMaskFromOutline: vi.fn(),
    onResetCorners: vi.fn(),
    ...overrides
})

describe('the file picker on a video/image source', () => {
    beforeEach(() => {
        uploadProjectAsset.mockReset()
    })

    it('uploads the chosen file, records it, and points the source at it', async () => {
        uploadProjectAsset.mockResolvedValue({
            id: 'a1', name: 'clip.mp4', mimeType: 'video/mp4', size: 1024, url: '/api/projects/p1/assets/a1'
        })
        const props = baseProps()
        render(
            <MapInspector
                surface={surfaceOf({ kind: 'video', ref: '' })}
                projectId="p1"
                assets={[]}
                {...props}
            />
        )

        const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' })
        fireEvent.change(document.querySelector('.map-field-file-input'), { target: { files: [file] } })

        await waitFor(() => expect(props.onUpsertAsset).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'a1', url: '/api/projects/p1/assets/a1' })
        ))
        expect(props.onUpdate).toHaveBeenCalledWith('s1', { source: { kind: 'video', ref: '/api/projects/p1/assets/a1' } })
        expect(await screen.findByText('Brought in clip.mp4.')).toBeTruthy()
    })

    it('shows the server refusal rather than pretending the upload worked', async () => {
        uploadProjectAsset.mockRejectedValue(Object.assign(new Error('Uploaded file is too large.'), { status: 413 }))
        const props = baseProps()
        render(
            <MapInspector
                surface={surfaceOf({ kind: 'image', ref: '' })}
                projectId="p1"
                assets={[]}
                {...props}
            />
        )

        const file = new File(['bytes'], 'huge.png', { type: 'image/png' })
        fireEvent.change(document.querySelector('.map-field-file-input'), { target: { files: [file] } })

        expect(await screen.findByText('Uploaded file is too large.')).toBeTruthy()
        expect(props.onUpdate).not.toHaveBeenCalled()
        expect(props.onUpsertAsset).not.toHaveBeenCalled()
    })

    it('lists only the project\'s own assets matching the source kind, not every asset', () => {
        const assets = [
            { id: 'a1', name: 'clip.mp4', mimeType: 'video/mp4', size: 2048 },
            { id: 'a2', name: 'photo.png', mimeType: 'image/png', size: 512 },
            { id: 'a3', name: 'reel.mov', mimeType: 'video/quicktime', size: 4096 }
        ]
        render(
            <MapInspector
                surface={surfaceOf({ kind: 'video', ref: '' })}
                projectId="p1"
                assets={assets}
                {...baseProps()}
            />
        )

        expect(screen.getByText(/clip\.mp4/)).toBeTruthy()
        expect(screen.getByText(/reel\.mov/)).toBeTruthy()
        expect(screen.queryByText(/photo\.png/)).toBeNull()
    })

    it('re-picking a listed asset sets the source without uploading again', () => {
        const assets = [{ id: 'a1', name: 'clip.mp4', mimeType: 'video/mp4', size: 2048, url: '/api/projects/p1/assets/a1' }]
        const props = baseProps()
        render(
            <MapInspector
                surface={surfaceOf({ kind: 'video', ref: '' })}
                projectId="p1"
                assets={assets}
                {...props}
            />
        )

        fireEvent.click(screen.getByText(/clip\.mp4/))
        expect(props.onUpdate).toHaveBeenCalledWith('s1', { source: { kind: 'video', ref: '/api/projects/p1/assets/a1' } })
        expect(uploadProjectAsset).not.toHaveBeenCalled()
    })

    it('offers no file picker for a web-page or test source', () => {
        render(
            <MapInspector
                surface={surfaceOf({ kind: 'url', ref: '' })}
                projectId="p1"
                assets={[]}
                {...baseProps()}
            />
        )
        expect(document.querySelector('.map-field-file-input')).toBeNull()
    })
})

describe('picking an NDI source by name', () => {
    const MACHINES = [
        { id: 'm1', name: 'aylmo', self: true, devices: [{ kind: 'camera', id: 'a', label: 'HD Webcam' }] },
        {
            id: 'm2',
            name: 'win',
            self: false,
            devices: [
                { kind: 'ndi', id: 'AYLMO (td_out_windows)', label: 'AYLMO (td_out_windows)' },
                { kind: 'ndi', id: 'WIN (OBS)', label: 'WIN (OBS)' }
            ]
        }
    ]

    const inspector = (ref, machines = MACHINES, props = baseProps()) => render(
        <MapInspector surface={surfaceOf({ kind: 'ndi', ref })} projectId="p1" assets={[]} machines={machines} {...props} />
    )

    it('offers the kind in the source list at all', () => {
        inspector('')
        expect(screen.getByRole('option', { name: 'NDI (source by name)' })).toBeTruthy()
    })

    it('suggests every source any machine can see, with the machine that sees it', () => {
        const { container } = inspector('')
        const options = [...container.querySelectorAll('#map-ndi-sources option')]
        expect(options.map((option) => option.value)).toEqual(['AYLMO (td_out_windows)', 'WIN (OBS)'])
        expect(options[0].textContent).toBe('win')
    })

    it('stores what was typed — a fragment is enough, and no address is ever stored', () => {
        const props = baseProps()
        const { container } = inspector('', MACHINES, props)
        fireEvent.change(container.querySelector('input[list="map-ndi-sources"]'), { target: { value: 'td_out' } })
        expect(props.onUpdate).toHaveBeenCalledWith('s1', { source: { kind: 'ndi', ref: 'td_out' } })
    })

    it('says which machine can show the name, so a wrong one is read here', () => {
        inspector('td_out')
        expect(screen.getByText('On win. Not on this machine.')).toBeTruthy()
    })

    it('warns about a name no machine can see', () => {
        const { container } = inspector('resolume')
        expect(screen.getByText('No machine here can see a source called “resolume”.')).toBeTruthy()
        expect(container.querySelector('.map-hint.is-warning')).toBeTruthy()
    })

    it('stays quiet while no machine has reported any NDI at all', () => {
        // A machine with no runtime reports nothing, which looks exactly like a
        // machine that has not answered yet. Accusing the name would be a lie.
        const { container } = inspector('td_out', [MACHINES[0]])
        expect(container.querySelector('.map-hint.is-warning')).toBeNull()
    })

    it('carries the trademark line and the link to ndi.video — a licence condition, not decoration', () => {
        // di.iiii never ships the NDI runtime: its licence cannot be passed on
        // under the AGPL, the person installs it themselves, and the
        // attribution plus the link are the terms on which we may name it.
        // docs/architecture/NDI.md. Do not delete this test to make a layout fit.
        const { container } = inspector('')
        expect(screen.getByText(/NDI® is a registered trademark of Vizrt NDI AB\./)).toBeTruthy()
        const link = container.querySelector('a[href="https://ndi.video"]')
        expect(link).toBeTruthy()
        expect(link.textContent).toBe('ndi.video')
    })

    it('shows none of it for another kind', () => {
        const { container } = render(
            <MapInspector surface={surfaceOf({ kind: 'stream', ref: 'obs' })} projectId="p1" assets={[]} machines={MACHINES} {...baseProps()} />
        )
        expect(container.querySelector('#map-ndi-sources')).toBeNull()
        expect(container.querySelector('a[href="https://ndi.video"]')).toBeNull()
    })
})
