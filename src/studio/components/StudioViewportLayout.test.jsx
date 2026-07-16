import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudioViewportLayout from './StudioViewportLayout.jsx'

vi.mock('./StudioPresentationSurface.jsx', () => ({
    default: ({ cameraView, controlsRef }) => {
        // Simulate CameraControls mounting and attaching to the pane's ref
        if (controlsRef && !controlsRef.current) {
            controlsRef.current = { setLookAt: vi.fn(), fitToBox: vi.fn() }
        }
        return <output data-testid="camera-view">{JSON.stringify(cameraView)}</output>
    }
}))

vi.mock('./StudioGraphSurface.jsx', () => ({
    default: ({ document }) => <output data-testid="graph-surface">{document?.projectMeta?.id || 'no-doc'}</output>
}))

const singlePane = { type: 'view', id: 'root' }
const graphPane = { type: 'view', id: 'root', viewType: 'graph' }

describe('StudioViewportLayout camera wiring', () => {
    // Regression guard: StudioEditor's controlsRef was a plain useRef that no
    // pane ever attached to — save-view, frame-selected, click placement, XR
    // restore, and saved-view-on-load all silently read null. Panes must
    // register their live camera-controls ref into shared.paneControlsRef.
    it('registers the pane camera-controls ref into shared.paneControlsRef', () => {
        const paneControlsRef = { current: null }
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ paneControlsRef }}
            />
        )
        expect(paneControlsRef.current).not.toBeNull()
        expect(typeof paneControlsRef.current.current.setLookAt).toBe('function')
    })

    it('opens the perspective view on the saved view when one exists', () => {
        const initialCameraView = { position: [9, 9, 9], target: [1, 2, 3] }
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ initialCameraView }}
            />
        )
        const view = JSON.parse(screen.getByTestId('camera-view').textContent)
        expect(view.position).toEqual([9, 9, 9])
        expect(view.target).toEqual([1, 2, 3])
    })

    it('falls back to the perspective preset without a saved view', () => {
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{}}
            />
        )
        const view = JSON.parse(screen.getByTestId('camera-view').textContent)
        expect(view.position).toEqual([4, 3, 6.5])
    })
})

describe('StudioViewportLayout node-graph pane (dev-only preview)', () => {
    it('renders the 3D viewport for a leaf with no viewType (default/unaffected)', () => {
        render(
            <StudioViewportLayout
                layout={singlePane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{}}
            />
        )
        expect(screen.getByTestId('camera-view')).toBeInTheDocument()
        expect(screen.queryByTestId('graph-surface')).not.toBeInTheDocument()
    })

    it('renders StudioGraphSurface for a viewType: "graph" leaf, not the 3D viewport', () => {
        render(
            <StudioViewportLayout
                layout={graphPane}
                onSplit={vi.fn()}
                onClose={vi.fn()}
                onSetRatio={vi.fn()}
                shared={{ document: { projectMeta: { id: 'proj-1' } } }}
            />
        )
        expect(screen.getByTestId('graph-surface')).toHaveTextContent('proj-1')
        expect(screen.queryByTestId('camera-view')).not.toBeInTheDocument()
    })
})
