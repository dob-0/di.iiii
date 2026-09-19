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
