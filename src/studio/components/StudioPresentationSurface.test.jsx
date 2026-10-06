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
        // The page learns its host, as on the public view (di.laser hung without it, 2026-10-05).
        expect(iframe?.getAttribute('srcdoc')).toContain(`window.diiPageOrigin = "${window.location.origin}"`)
        // Without escape, tabs opened by preview content inherit the sandbox's
        // opaque origin and white-screen (module loads become cross-origin).
        expect(iframe?.getAttribute('sandbox')).toContain('allow-popups-to-escape-sandbox')
        expect(viewportPropsSpy).not.toHaveBeenCalled()
    })

    // known-fixes "Studio would not move on MOXIR": the mode alone locked the editor's
    // camera. A composed shot is where the camera starts; only locked: true holds it.
    it('starts at the fixed camera but lets it move when the shot is not locked', () => {
        render(
            <StudioPresentationSurface
                document={buildDocument({ mode: 'fixed-camera', fixedCamera: { position: [3, 4, 5], target: [0, 1, 0], projection: 'perspective', fov: 60, locked: false } })}
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

        expect(screen.getByText('studio-viewport:free')).toBeInTheDocument()
        expect(viewportPropsSpy).toHaveBeenCalledWith(expect.objectContaining({
            enableNavigation: undefined,
            cameraView: expect.objectContaining({ position: [3, 4, 5], target: [0, 1, 0] })
        }))
    })

    it('locks camera navigation when the fixed camera is locked', () => {
        render(
            <StudioPresentationSurface
                document={buildDocument({ mode: 'fixed-camera', fixedCamera: { position: [3, 4, 5], target: [0, 1, 0], projection: 'orthographic', fov: 35, zoom: 1.5, near: 0.1, far: 120, locked: true } })}
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
