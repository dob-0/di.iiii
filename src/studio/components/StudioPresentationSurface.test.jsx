import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioPresentationSurface from './StudioPresentationSurface.jsx'
import { PREVIEW_HOST_MESSAGE_TYPE } from '../../utils/presentationPreviewDocument.js'

const viewportPropsSpy = vi.fn()

vi.mock('./StudioViewport.jsx', () => ({
    default: function MockStudioViewport(props) {
        viewportPropsSpy(props)
        return <div>studio-viewport:{props.enableNavigation === false ? 'locked' : 'free'}</div>
    }
}))

const buildDocument = (presentationState = {}) => ({
    projectMeta: {
        id: 'studio-project',
        title: 'Studio Project'
    },
    worldState: {
        savedView: {
            position: [0, 2, 5],
            target: [0, 0, 0],
            projection: 'perspective',
            fov: 50,
            zoom: 1,
            near: 0.1,
            far: 200
        }
    },
    presentationState: {
        mode: 'scene',
        entryView: 'scene',
        codeHtml: '',
        fixedCamera: {
            position: [3, 4, 5],
            target: [0, 1, 0],
            projection: 'orthographic',
            fov: 35,
            zoom: 1.5,
            near: 0.1,
            far: 120
        },
        ...presentationState
    },
    entities: [],
    assets: []
})

describe('StudioPresentationSurface', () => {
    afterEach(() => {
        viewportPropsSpy.mockReset()
    })

    it('renders a live code preview when Studio preview mode is code', () => {
        const { container } = render(
            <StudioPresentationSurface
                document={buildDocument({
                    mode: 'code',
                    codeHtml: '<main>Studio code preview</main>'
                })}
                selectedEntityId={null}
                onSelectEntity={vi.fn()}
                cursors={{}}
                onCursorMove={vi.fn()}
                onCursorLeave={vi.fn()}
                cameraView={{ position: [0, 2, 5], target: [0, 0, 0] }}
                controlsRef={{ current: null }}
                xrStore={{}}
                onCameraChange={vi.fn()}
            />
        )

        const iframe = container.querySelector('iframe')
        expect(iframe).not.toBeNull()
        expect(iframe?.getAttribute('srcdoc')).toContain('Studio code preview')
        expect(iframe?.getAttribute('srcdoc')).toContain(PREVIEW_HOST_MESSAGE_TYPE)
        expect(viewportPropsSpy).not.toHaveBeenCalled()
    })

    it('locks camera navigation when Studio preview mode is fixed camera', () => {
        render(
            <StudioPresentationSurface
                document={buildDocument({ mode: 'fixed-camera' })}
                selectedEntityId={null}
                onSelectEntity={vi.fn()}
                cursors={{}}
                onCursorMove={vi.fn()}
                onCursorLeave={vi.fn()}
                cameraView={{ position: [0, 2, 5], target: [0, 0, 0] }}
                controlsRef={{ current: null }}
                xrStore={{}}
                onCameraChange={vi.fn()}
            />
        )

        expect(screen.getByText('studio-viewport:locked')).toBeInTheDocument()
        expect(viewportPropsSpy).toHaveBeenCalledWith(expect.objectContaining({
            enableNavigation: false,
            cameraView: expect.objectContaining({
                position: [3, 4, 5],
                target: [0, 1, 0],
                projection: 'orthographic'
            })
        }))
    })
})
